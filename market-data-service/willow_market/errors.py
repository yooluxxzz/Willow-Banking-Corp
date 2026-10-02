"""Upstream error taxonomy shared by the provider, the service and the HTTP layer."""

from __future__ import annotations

import re

RATE_LIMIT_RETRY_AFTER = 60

# yfinance raises these (by class name) when Yahoo has no data for a symbol.
_NOT_FOUND_CLASS_NAMES = frozenset({"YFTickerMissingError", "YFTzMissingError", "YFPricesMissingError"})
_RATE_LIMIT_MESSAGE = re.compile(r"too many requests|rate[ -]?limit|\b429\b", re.IGNORECASE)


class UpstreamError(Exception):
    """A failure to obtain data from the upstream provider."""

    code = "unavailable"


class NotFoundError(UpstreamError):
    """The symbol, or the requested data for it, does not exist upstream."""

    code = "not_found"


class UnavailableError(UpstreamError):
    """The upstream provider failed, timed out or is not installed."""


class RateLimitedError(UpstreamError):
    """The upstream provider is throttling us."""

    code = "rate_limited"

    def __init__(self, retry_after: int = RATE_LIMIT_RETRY_AFTER) -> None:
        super().__init__(f"rate limited; retry after {retry_after}s")
        self.retry_after = retry_after


def classify_error(exc: BaseException) -> UpstreamError:
    """Map any exception raised while fetching upstream onto the service's error taxonomy.

    Detection uses class names, HTTP status codes and messages so that yfinance's exception
    module (which changes between releases) never has to be imported.
    """
    if isinstance(exc, UpstreamError):
        return exc
    class_names = {cls.__name__ for cls in type(exc).__mro__}
    status = getattr(getattr(exc, "response", None), "status_code", None)
    if "YFRateLimitError" in class_names or status == 429 or _RATE_LIMIT_MESSAGE.search(str(exc)):
        return RateLimitedError()
    if class_names & _NOT_FOUND_CLASS_NAMES or status == 404:
        return NotFoundError(str(exc))
    return UnavailableError(f"{type(exc).__name__}: {exc}")
