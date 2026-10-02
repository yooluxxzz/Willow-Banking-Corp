"""yfinance access and normalisation into the service's JSON shapes.

yfinance is imported lazily so the HTTP server, ``/health`` and the tests work without it. Every
public method either returns plain JSON-safe Python (no NaN/inf, no numpy/pandas types) or raises;
errors are classified by :func:`willow_market.errors.classify_error`.
"""

from __future__ import annotations

import importlib.util
import logging
import sys
from collections.abc import Mapping
from typing import Any, Callable, Optional

from .errors import NotFoundError
from .normalize import to_date_iso, to_float, to_http_url, to_int, to_iso_utc, to_text, utc_now_iso

logger = logging.getLogger(__name__)

TickerFactory = Callable[[str], Any]

# API range -> (yfinance period, yfinance interval)
HISTORY_RANGES: dict[str, tuple[str, str]] = {
    "1d": ("1d", "5m"),
    "1w": ("5d", "30m"),
    "1m": ("1mo", "1d"),
    "6m": ("6mo", "1d"),
    "1y": ("1y", "1d"),
    "5y": ("5y", "1wk"),
    "max": ("max", "1mo"),
}
_DATE_INTERVALS = frozenset({"1d", "1wk", "1mo"})
_INFO_PRICE_KEYS = ("regularMarketPrice", "currentPrice", "regularMarketPreviousClose", "previousClose", "navPrice")
MAX_NEWS_ITEMS = 20


def yfinance_available() -> bool:
    """Report whether yfinance can be imported, without importing it."""
    if sys.modules.get("yfinance") is not None:
        return True
    try:
        return importlib.util.find_spec("yfinance") is not None
    except (ImportError, ValueError):
        return False


def _yfinance_ticker_factory() -> TickerFactory:
    """Import yfinance on first use and make it raise on network failures."""
    import yfinance

    debug = getattr(getattr(yfinance, "config", None), "debug", None)
    if debug is not None:
        # By default yfinance logs network errors and returns empty data, which is
        # indistinguishable from an unknown symbol (404) instead of an outage (503).
        debug.hide_exceptions = False
    return yfinance.Ticker


class YFinanceProvider:
    """Fetches market data from Yahoo Finance through yfinance and normalises it."""

    def __init__(self, ticker_factory: Optional[TickerFactory] = None) -> None:
        self._ticker_factory = ticker_factory

    def _ticker(self, symbol: str) -> Any:
        if self._ticker_factory is None:
            self._ticker_factory = _yfinance_ticker_factory()
        return self._ticker_factory(symbol)

    def quote(self, symbol: str) -> dict[str, Any]:
        """Return a delayed quote from ``Ticker.fast_info``.

        ``asOf`` is Yahoo's ``regularMarketTime`` from the history metadata that fast_info has
        already loaded (no extra request), falling back to the fetch time.
        """
        ticker = self._ticker(symbol)
        fast = ticker.fast_info
        price = to_float(fast["last_price"])
        if price is None or price <= 0:
            raise NotFoundError(f"no price for {symbol}")
        previous_close = _positive(_read(fast, "regular_market_previous_close"))
        if previous_close is None:  # fallback only: previous_close costs fast_info another request
            previous_close = _positive(_read(fast, "previous_close"))
        change = change_percent = None
        if previous_close is not None:
            change = round(price - previous_close, 6)
            change_percent = round((price - previous_close) / previous_close * 100, 4)
        return {
            "symbol": symbol,
            "price": price,
            "previousClose": previous_close,
            "change": change,
            "changePercent": change_percent,
            "currency": to_text(_read(fast, "currency")),
            "exchange": to_text(_read(fast, "exchange")),
            "dayHigh": to_float(_read(fast, "day_high")),
            "dayLow": to_float(_read(fast, "day_low")),
            "volume": to_int(_read(fast, "last_volume")),
            "marketCap": to_int(_read(fast, "market_cap")),
            "fiftyTwoWeekHigh": to_float(_read(fast, "year_high")),
            "fiftyTwoWeekLow": to_float(_read(fast, "year_low")),
            "asOf": to_iso_utc(_metadata(ticker).get("regularMarketTime")) or utc_now_iso(),
        }

    def history(self, symbol: str, range_key: str) -> dict[str, Any]:
        """Return OHLCV bars for one of :data:`HISTORY_RANGES`; rows without a close are dropped."""
        period, interval = HISTORY_RANGES[range_key]
        ticker = self._ticker(symbol)
        frame = ticker.history(period=period, interval=interval, auto_adjust=False, actions=False, raise_errors=True)
        stamp = to_date_iso if interval in _DATE_INTERVALS else to_iso_utc
        points = []
        for moment, row in zip(frame.index, frame.to_dict("records")):
            close, t = to_float(row.get("Close")), stamp(moment)
            if close is None or t is None:
                continue
            points.append(
                {
                    "t": t,
                    "open": to_float(row.get("Open")),
                    "high": to_float(row.get("High")),
                    "low": to_float(row.get("Low")),
                    "close": close,
                    "volume": to_int(row.get("Volume")),
                }
            )
        if not points:
            raise NotFoundError(f"no {range_key} history for {symbol}")
        return {
            "symbol": symbol,
            "range": range_key,
            "interval": interval,
            "currency": to_text(_metadata(ticker).get("currency")),
            "points": points,
        }

    def profile(self, symbol: str) -> dict[str, Any]:
        """Return company/fund details from ``Ticker.info``; missing fields are None."""
        info = self._ticker(symbol).info
        if not isinstance(info, Mapping):
            info = {}
        name = to_text(info.get("longName")) or to_text(info.get("shortName"))
        if name is None and all(to_float(info.get(key)) is None for key in _INFO_PRICE_KEYS):
            raise NotFoundError(f"no profile for {symbol}")
        return {
            "symbol": symbol,
            "name": name,
            "description": to_text(info.get("longBusinessSummary")) or to_text(info.get("description")),
            "sector": to_text(info.get("sector")),
            "industry": to_text(info.get("industry")),
            "website": to_http_url(info.get("website")),
            "country": to_text(info.get("country")),
            "employees": to_int(info.get("fullTimeEmployees")),
            "currency": to_text(info.get("currency")),
            "exchange": to_text(info.get("exchange")),
            "quoteType": to_text(info.get("quoteType")),
            "marketCap": to_int(info.get("marketCap")),
            "trailingPE": to_float(info.get("trailingPE")),
            "forwardPE": to_float(info.get("forwardPE")),
            "dividendYield": _dividend_yield_percent(info),
            "beta": to_float(info.get("beta")),
            "fiftyTwoWeekHigh": to_float(info.get("fiftyTwoWeekHigh")),
            "fiftyTwoWeekLow": to_float(info.get("fiftyTwoWeekLow")),
            "averageVolume": to_int(info.get("averageVolume")),
        }

    def news(self, symbol: str) -> list[dict[str, Any]]:
        """Return up to :data:`MAX_NEWS_ITEMS` headlines with a title and an http(s) URL."""
        articles = self._ticker(symbol).get_news(count=MAX_NEWS_ITEMS)
        items: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        for article in articles or []:
            item = _news_item(article)
            if item is not None and item["url"] not in seen_urls:
                seen_urls.add(item["url"])
                items.append(item)
        return items[:MAX_NEWS_ITEMS]


def _read(fast_info: Any, key: str) -> Any:
    """Read an optional fast_info field; yfinance computes them lazily and any may raise."""
    try:
        return fast_info[key]
    except Exception as exc:  # optional fields degrade to null
        logger.debug("fast_info[%r] unavailable: %s: %s", key, type(exc).__name__, exc)
        return None


def _positive(value: Any) -> Optional[float]:
    number = to_float(value)
    return number if number is not None and number > 0 else None


def _metadata(ticker: Any) -> Mapping[str, Any]:
    """Return the ticker's cached chart metadata (currency, regularMarketTime, ...) or {}."""
    try:
        metadata = ticker.get_history_metadata()
    except Exception:  # metadata only enriches the response
        return {}
    return metadata if isinstance(metadata, Mapping) else {}


def _dividend_yield_percent(info: Mapping[str, Any]) -> Optional[float]:
    """Return ``dividendYield`` as a percentage (0.44 means 0.44 %).

    Yahoo/yfinance have reported it both as a fraction (0.0044) and as a percentage (0.44). The
    reading closest to an independent estimate (dividendRate / price, or the always-fractional
    trailingAnnualDividendYield) wins; without one the current percentage form is assumed.
    """
    raw = to_float(info.get("dividendYield"))
    if raw is None:
        return None
    rate = to_float(info.get("dividendRate"))
    price = next((p for p in (_positive(info.get(key)) for key in _INFO_PRICE_KEYS) if p is not None), None)
    trailing = to_float(info.get("trailingAnnualDividendYield"))
    if rate is not None and price is not None:
        reference: Optional[float] = rate / price * 100
    elif trailing is not None:
        reference = trailing * 100
    else:
        return round(raw, 4)
    as_fraction = raw * 100
    return round(raw if abs(raw - reference) <= abs(as_fraction - reference) else as_fraction, 4)


def _nested(mapping: Any, *keys: str) -> Any:
    for key in keys:
        if not isinstance(mapping, Mapping):
            return None
        mapping = mapping.get(key)
    return mapping


def _news_item(article: Any) -> Optional[dict[str, Any]]:
    """Normalise one ``Ticker.get_news`` entry in either the nested (current) or flat (legacy) shape."""
    if not isinstance(article, Mapping):
        return None
    content = article.get("content")
    if isinstance(content, Mapping):
        title, summary = content.get("title"), content.get("summary")
        publisher = _nested(content, "provider", "displayName")
        url = to_http_url(_nested(content, "canonicalUrl", "url")) or to_http_url(
            _nested(content, "clickThroughUrl", "url")
        )
        published = content.get("pubDate") or content.get("displayTime")
    else:
        title, summary = article.get("title"), article.get("summary")
        publisher = article.get("publisher")
        url = to_http_url(article.get("link"))
        published = article.get("providerPublishTime")
    title = to_text(title)
    if title is None or url is None:
        return None
    return {
        "title": title,
        "publisher": to_text(publisher),
        "url": url,
        "publishedAt": to_iso_utc(published),
        "summary": to_text(summary),
    }
