"""Caching, request coalescing, timeouts and stale fallback in front of the provider."""

from __future__ import annotations

import concurrent.futures
import logging
import math
import threading
import time
from concurrent.futures import Future
from dataclasses import dataclass
from functools import partial
from typing import Any, Callable, Optional

from .cache import CachedValue, TTLCache
from .errors import NotFoundError, RateLimitedError, UpstreamError, classify_error
from .provider import YFinanceProvider

logger = logging.getLogger(__name__)

QUOTE_TTL = 60.0
HISTORY_TTLS = {"1d": 120.0, "1w": 600.0}
HISTORY_DEFAULT_TTL = 1800.0
PROFILE_TTL = 12 * 3600.0
NEWS_TTL = 1800.0
DEFAULT_TIMEOUT = 10.0
DEFAULT_MAX_WORKERS = 8


@dataclass(frozen=True)
class _Pending:
    """A cache lookup plus, unless the hit was fresh, the upstream fetch to wait for."""

    key: str
    cached: Optional[CachedValue]
    future: Optional[Future]


class MarketDataService:
    """Serves provider data through a TTL cache.

    * Cold or expired keys are fetched on daemon worker threads, at most ``max_workers`` upstream
      calls at a time; concurrent requests for the same key share one fetch.
    * Callers wait at most ``timeout`` seconds (for a whole quote batch, not per symbol). A fetch
      that is still running keeps going in the background and fills the cache when it finishes.
    * If a refresh fails or times out, an expired entry (kept for 24h) is served with
      ``stale: true``; without one the classified :class:`UpstreamError` is raised.
    * After an upstream rate limit, no upstream calls are made for ``retry_after`` seconds.
    """

    def __init__(
        self,
        provider: YFinanceProvider,
        cache: Optional[TTLCache] = None,
        *,
        timeout: float = DEFAULT_TIMEOUT,
        max_workers: int = DEFAULT_MAX_WORKERS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._provider = provider
        self._clock = clock
        self._cache = cache if cache is not None else TTLCache(clock=clock)
        self._timeout = timeout
        self._slots = threading.BoundedSemaphore(max_workers)
        self._inflight: dict[str, Future] = {}
        self._inflight_lock = threading.Lock()
        self._cooldown_until = 0.0

    def quotes(self, symbols: list[str]) -> tuple[list[dict[str, Any]], dict[str, UpstreamError]]:
        """Return quotes in request order plus per-symbol errors for the ones that failed."""
        deadline = time.monotonic() + self._timeout
        pending = [self._begin(f"quote:{s}", QUOTE_TTL, partial(self._provider.quote, s)) for s in symbols]
        quotes: list[dict[str, Any]] = []
        errors: dict[str, UpstreamError] = {}
        for symbol, item in zip(symbols, pending):
            try:
                value, stale = self._finish(item, deadline)
            except UpstreamError as error:
                errors[symbol] = error
            else:
                quotes.append({**value, "stale": stale})
        return quotes, errors

    def history(self, symbol: str, range_key: str) -> dict[str, Any]:
        ttl = HISTORY_TTLS.get(range_key, HISTORY_DEFAULT_TTL)
        load = partial(self._provider.history, symbol, range_key)
        value, stale = self._get(f"history:{symbol}:{range_key}", ttl, load)
        return {**value, "stale": stale}

    def profile(self, symbol: str) -> dict[str, Any]:
        value, stale = self._get(f"profile:{symbol}", PROFILE_TTL, partial(self._provider.profile, symbol))
        return {**value, "stale": stale}

    def news(self, symbol: str, limit: int) -> dict[str, Any]:
        items, stale = self._get(f"news:{symbol}", NEWS_TTL, partial(self._provider.news, symbol))
        return {"symbol": symbol, "items": items[:limit], "stale": stale}

    def _get(self, key: str, ttl: float, load: Callable[[], Any]) -> tuple[Any, bool]:
        return self._finish(self._begin(key, ttl, load), time.monotonic() + self._timeout)

    def _begin(self, key: str, ttl: float, load: Callable[[], Any]) -> _Pending:
        cached = self._cache.get(key)
        if cached is not None and cached.fresh:
            return _Pending(key, cached, None)
        return _Pending(key, cached, self._start(key, ttl, load))

    def _start(self, key: str, ttl: float, load: Callable[[], Any]) -> Future:
        """Return the in-flight fetch for ``key``, starting one unless upstream is rate limiting us."""
        future: Future = Future()
        cooldown = self._cooldown_until - self._clock()
        if cooldown > 0:
            future.set_exception(RateLimitedError(math.ceil(cooldown)))
            return future
        with self._inflight_lock:
            existing = self._inflight.get(key)
            if existing is not None:
                return existing
            self._inflight[key] = future
        worker = threading.Thread(target=self._run, args=(key, ttl, load, future), name=f"upstream {key}", daemon=True)
        worker.start()
        return future

    def _run(self, key: str, ttl: float, load: Callable[[], Any], future: Future) -> None:
        try:
            with self._slots:
                value = load()
        except Exception as exc:  # every upstream failure is classified, logged and handed to the waiters
            error = classify_error(exc)
            if isinstance(error, RateLimitedError):
                self._cooldown_until = self._clock() + error.retry_after
            level = logging.INFO if isinstance(error, NotFoundError) else logging.WARNING
            logger.log(level, "upstream %s failed (%s): %s: %.200s", key, error.code, type(exc).__name__, exc)
            future.set_exception(error)
        else:
            self._cache.set(key, value, ttl)
            future.set_result(value)
        finally:
            with self._inflight_lock:
                self._inflight.pop(key, None)

    def _finish(self, pending: _Pending, deadline: float) -> tuple[Any, bool]:
        """Resolve a pending lookup to ``(value, stale)`` or raise an :class:`UpstreamError`."""
        if pending.future is None:
            assert pending.cached is not None
            return pending.cached.value, False
        try:
            return pending.future.result(timeout=max(0.0, deadline - time.monotonic())), False
        except Exception as exc:
            if isinstance(exc, concurrent.futures.TimeoutError):
                logger.warning("upstream %s timed out after %.1fs", pending.key, self._timeout)
            if pending.cached is None:
                error = classify_error(exc)
                if error is exc:
                    raise
                raise error from exc
            logger.info("serving stale %s", pending.key)
            return pending.cached.value, True
