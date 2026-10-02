"""Conversions from loosely typed upstream values (numpy, pandas, strings) to JSON-safe Python."""

from __future__ import annotations

import math
import numbers
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlsplit

_ISO_FORMAT = "%Y-%m-%dT%H:%M:%SZ"
_EPOCH_MILLISECONDS_THRESHOLD = 1e11  # epoch values above this are milliseconds, not seconds


def to_float(value: Any) -> Optional[float]:
    """Return a finite float, or None for missing, non-numeric, NaN and infinite values."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if math.isfinite(number) else None


def to_int(value: Any) -> Optional[int]:
    """Return the value rounded to a plain int, or None when it is not a finite number."""
    number = to_float(value)
    return None if number is None else round(number)


def to_text(value: Any) -> Optional[str]:
    """Return a stripped, non-empty string, or None."""
    if not isinstance(value, str):
        return None
    return value.strip() or None


def to_http_url(value: Any) -> Optional[str]:
    """Return the value if it is an absolute http(s) URL, otherwise None."""
    text = to_text(value)
    if text is None:
        return None
    try:
        parts = urlsplit(text)
    except ValueError:
        return None
    return text if parts.scheme.lower() in ("http", "https") and parts.netloc else None


def to_datetime(value: Any) -> Optional[datetime]:
    """Parse a datetime/pandas Timestamp, epoch seconds or milliseconds, or an ISO-8601 string.

    Naive values are assumed to be UTC. The result is timezone-aware UTC, or None (also for NaT).
    """
    try:
        if isinstance(value, datetime):
            moment = value
        elif isinstance(value, numbers.Real) and not isinstance(value, bool):
            seconds = float(value)
            if seconds > _EPOCH_MILLISECONDS_THRESHOLD:
                seconds /= 1000
            moment = datetime.fromtimestamp(seconds, tz=timezone.utc)
        elif isinstance(value, str) and value.strip():
            moment = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        else:
            return None
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=timezone.utc)
        return moment.astimezone(timezone.utc)
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def to_iso_utc(value: Any) -> Optional[str]:
    """Format any value accepted by :func:`to_datetime` as ``YYYY-MM-DDTHH:MM:SSZ``."""
    moment = to_datetime(value)
    return None if moment is None else moment.strftime(_ISO_FORMAT)


def to_date_iso(value: Any) -> Optional[str]:
    """Format a bar timestamp as its own calendar date (exchange time zone) at ``T00:00:00Z``.

    Used for daily and coarser bars so a trading day never shifts to the previous date when an
    exchange's local midnight is converted to UTC.
    """
    if not isinstance(value, datetime) or to_datetime(value) is None:
        return None
    return f"{value.date().isoformat()}T00:00:00Z"


def utc_now_iso() -> str:
    """Return the current time as ``YYYY-MM-DDTHH:MM:SSZ``."""
    return datetime.now(timezone.utc).strftime(_ISO_FORMAT)
