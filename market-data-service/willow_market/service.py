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
DEFAULT_REVALIDATE_WINDOW = 300.0
FAILURE_LOG_INTERVAL = 60.0


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
    * An entry that expired less than ``revalidate_window`` seconds ago is served at once while a
      background refresh updates it for the next caller, so a page never waits on a routine refresh.
    * If a refresh fails or times out, an older expired entry (kept for 24h) is served with
      ``stale: true``; without one the classified :class:`UpstreamError` is raised.
    * After an upstream rate limit, no upstream calls are made for ``retry_after`` seconds.
    * Upstream failures of the same kind are logged at most once per ``FAILURE_LOG_INTERVAL``, with a
      count of the ones in between, so an outage doesn't print a line per symbol.
    """

    def __init__(
        self,
        provider: YFinanceProvider,
        cache: Optional[TTLCache] = None,
        *,
        timeout: float = DEFAULT_TIMEOUT,
        max_workers: int = DEFAULT_MAX_WORKERS,
        revalidate_window: float = DEFAULT_REVALIDATE_WINDOW,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._provider = provider
        self._clock = clock
        self._cache = cache if cache is not None else TTLCache(clock=clock)
        self._timeout = timeout
        self._revalidate_window = revalidate_window
        self._slots = threading.BoundedSemaphore(max_workers)
        self._inflight: dict[str, Future] = {}
        self._inflight_lock = threading.Lock()
        self._cooldown_until = 0.0
        self._failure_log: dict[str, tuple[float, int]] = {}  # error code -> (last logged, skipped since)
        self._failure_log_lock = threading.Lock()

    def quotes(self, symbols: list[str]) -> tuple[list[dict[str, Any]], dict[str, UpstreamError]]:
        """Return quotes in request order plus per-symbol errors for the ones that failed."""
        deadline = time.monotonic() + self._timeout
        pending = [self._begin(f"quote:{s}", QUOTE_TTL, partial(self._provider.quote, s)) for s in symbols]
        quotes: list[dict[str, Any]] = []
        errors: dict[str, UpstreamError] = {}
        for symbol, item in zip(symbols, pending):
            try:
                value, stale = self._finish(item, deadline, log_timeout=False)
            except UpstreamError as error:
                errors[symbol] = error
            else:
                quotes.append({**value, "stale": stale})
        loading = sum(1 for item in pending if item.future is not None and not item.future.done())
        if loading:
            # Not a failure: those fetches carry on and are cached for the next request.
            logger.info(
                "%d of %d quotes still loading after %.1fs; they finish in the background",
                loading,
                len(pending),
                self._timeout,
            )
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
        if cached is not None and cached.expired_for < self._revalidate_window:
            self._start(key, ttl, load)  # recently expired: answer now, refresh for the next caller
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
            self._log_failure(key, error, exc)
            future.set_exception(error)
        else:
            self._cache.set(key, value, ttl)
            future.set_result(value)
        finally:
            with self._inflight_lock:
                self._inflight.pop(key, None)

    def _log_failure(self, key: str, error: UpstreamError, exc: Exception) -> None:
        """Log an upstream failure; repeats of the same kind within a minute are only counted."""
        detail = f"{type(exc).__name__}: {str(exc)[:200]}"
        if isinstance(error, NotFoundError):
            logger.info("upstream %s failed (%s): %s", key, error.code, detail)
            return
        now = self._clock()
        with self._failure_log_lock:
            last, skipped = self._failure_log.get(error.code, (None, 0))
            if last is not None and now - last < FAILURE_LOG_INTERVAL:
                self._failure_log[error.code] = (last, skipped + 1)
                logger.debug("upstream %s failed (%s): %s", key, error.code, detail)
                return
            self._failure_log[error.code] = (now, 0)
        since = f" (and {skipped} similar failures since the last message)" if skipped else ""
        logger.warning("upstream %s failed (%s): %s%s", key, error.code, detail, since)

    def _finish(self, pending: _Pending, deadline: float, *, log_timeout: bool = True) -> tuple[Any, bool]:
        """Resolve a pending lookup to ``(value, stale)`` or raise an :class:`UpstreamError`."""
        if pending.future is None:
            assert pending.cached is not None
            return pending.cached.value, False
        try:
            return pending.future.result(timeout=max(0.0, deadline - time.monotonic())), False
        except Exception as exc:
            if log_timeout and isinstance(exc, concurrent.futures.TimeoutError):
                logger.info(
                    "upstream %s still loading after %.1fs; it finishes in the background", pending.key, self._timeout
                )
            if pending.cached is None:
                error = classify_error(exc)
                if error is exc:
                    raise
                raise error from exc
            logger.info("serving stale %s", pending.key)
            return pending.cached.value, True
