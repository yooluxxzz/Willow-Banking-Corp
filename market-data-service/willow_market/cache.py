"""Thread-safe in-memory TTL cache that keeps expired entries for stale-on-error fallback."""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Callable, Optional

DEFAULT_STALE_WINDOW = 24 * 60 * 60.0
DEFAULT_MAX_ENTRIES = 5000


@dataclass(frozen=True)
class CachedValue:
    """A cache hit: the stored value and whether it is still within its TTL."""

    value: Any
    fresh: bool


class TTLCache:
    """Maps keys to values with a per-entry TTL.

    Entries past their TTL are still returned (``fresh=False``) for ``stale_window`` seconds so
    callers can serve them when a refresh fails; after that they are dropped. The least recently
    written entries are evicted once ``max_entries`` is exceeded.
    """

    def __init__(
        self,
        stale_window: float = DEFAULT_STALE_WINDOW,
        max_entries: int = DEFAULT_MAX_ENTRIES,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._stale_window = stale_window
        self._max_entries = max_entries
        self._clock = clock
        self._lock = threading.Lock()
        self._entries: OrderedDict[str, tuple[Any, float]] = OrderedDict()

    def get(self, key: str) -> Optional[CachedValue]:
        """Return the entry for ``key`` (fresh or stale), or None if absent or too old."""
        now = self._clock()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if now >= expires_at + self._stale_window:
                del self._entries[key]
                return None
            return CachedValue(value, now < expires_at)

    def set(self, key: str, value: Any, ttl: float) -> None:
        """Store ``value`` under ``key`` for ``ttl`` seconds."""
        with self._lock:
            self._entries[key] = (value, self._clock() + ttl)
            self._entries.move_to_end(key)
            while len(self._entries) > self._max_entries:
                self._entries.popitem(last=False)

    def __len__(self) -> int:
        with self._lock:
            return len(self._entries)
