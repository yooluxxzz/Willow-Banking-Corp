"""Tests for the Willow market-data service.

yfinance is always faked (an injected ticker factory, or a fake module in ``sys.modules``), so the
suite never touches the network and runs whether or not yfinance/pandas are installed.
Run from the repository root: ``python3 -m unittest discover -s market-data-service/tests -v``
"""

from __future__ import annotations

import importlib.util
import json
import sys
import threading
import time
import types
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from email.message import Message
from pathlib import Path
from typing import Any, Optional
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from willow_market import __version__  # noqa: E402
from willow_market.app import create_server  # noqa: E402
from willow_market.cache import TTLCache  # noqa: E402
from willow_market.errors import (  # noqa: E402
    NotFoundError,
    RateLimitedError,
    UnavailableError,
    classify_error,
)
from willow_market.normalize import to_date_iso, to_float, to_int, to_iso_utc  # noqa: E402
from willow_market.provider import HISTORY_RANGES, YFinanceProvider, yfinance_available  # noqa: E402
from willow_market.service import MarketDataService  # noqa: E402

NEW_YORK = timezone(timedelta(hours=-4))
TOKYO = timezone(timedelta(hours=9))
AS_OF = 1790971140  # 2026-10-02T19:59:00Z
NAN = float("nan")
HAS_PANDAS = importlib.util.find_spec("pandas") is not None
INF = float("inf")


# --- yfinance stand-ins -------------------------------------------------------------------------


class YFRateLimitError(Exception):
    """Same class name as yfinance's rate-limit exception."""


class YFTzMissingError(Exception):
    """Same class name as the exception yfinance raises for unknown symbols."""


class ProxyConnectionError(OSError):
    """A network failure such as the sandbox's blocked outbound connection."""


class FakeFrame:
    """The slice of the pandas DataFrame API the provider relies on."""

    def __init__(self, rows: list[tuple[datetime, dict[str, Any]]]) -> None:
        self.index = [moment for moment, _ in rows]
        self._records = [record for _, record in rows]

    def to_dict(self, orient: str) -> list[dict[str, Any]]:
        assert orient == "records"
        return [dict(record) for record in self._records]


class FakeFastInfo:
    """Dict-like, like yfinance's FastInfo; values that are exceptions raise on access."""

    def __init__(self, values: dict[str, Any]) -> None:
        self._values = values

    def __getitem__(self, key: str) -> Any:
        value = self._values[key]
        if isinstance(value, BaseException):
            raise value
        return value


class FakeMarket:
    """A ticker factory serving per-symbol data; any value may be an exception to raise instead.

    Symbols missing from a table behave like unknown symbols in yfinance (YFTzMissingError).
    """

    def __init__(self) -> None:
        self.fast_info: dict[str, Any] = {}
        self.history: dict[str, Any] = {}
        self.info: dict[str, Any] = {}
        self.news: dict[str, Any] = {}
        self.metadata: dict[str, dict[str, Any]] = {}
        self.history_calls: list[dict[str, Any]] = []
        self.tickers_created = 0
        self.gate: Optional[threading.Event] = None
        self._lock = threading.Lock()

    def __call__(self, symbol: str) -> FakeTicker:
        with self._lock:
            self.tickers_created += 1
        if self.gate is not None:
            self.gate.wait(10)
        return FakeTicker(self, symbol)


class FakeTicker:
    def __init__(self, market: FakeMarket, symbol: str) -> None:
        self._market = market
        self._symbol = symbol

    def _lookup(self, table: dict[str, Any]) -> Any:
        value = table.get(self._symbol, YFTzMissingError(f"${self._symbol}: possibly delisted; no timezone found"))
        if isinstance(value, BaseException):
            raise value
        return value

    @property
    def fast_info(self) -> FakeFastInfo:
        return FakeFastInfo(self._lookup(self._market.fast_info))

    @property
    def info(self) -> Any:
        return self._lookup(self._market.info)

    def history(self, **kwargs: Any) -> Any:
        self._market.history_calls.append(kwargs)
        return self._lookup(self._market.history)

    def get_news(self, count: int = 10) -> Any:
        return self._lookup(self._market.news)

    def get_history_metadata(self) -> dict[str, Any]:
        return self._market.metadata.get(self._symbol, {})


def fast_info(price: Any = 231.4, previous: Any = 229.1, **overrides: Any) -> dict[str, Any]:
    values = {
        "last_price": price,
        "regular_market_previous_close": previous,
        "previous_close": previous,
        "currency": "USD",
        "exchange": "NMS",
        "day_high": 232.0,
        "day_low": 228.7,
        "last_volume": 41234567,
        "market_cap": 3.5e12,
        "year_high": 260.1,
        "year_low": 164.0,
    }
    values.update(overrides)
    return values


def daily_frame(*closes: Any) -> FakeFrame:
    rows = []
    for day, close in enumerate(closes, start=1):
        moment = datetime(2026, 9, day, tzinfo=NEW_YORK)
        rows.append((moment, {"Open": 1.0, "High": 2.0, "Low": 0.5, "Close": close, "Volume": 100 * day}))
    return FakeFrame(rows)


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


# --- unit tests -------------------------------------------------------------------------------


class NormalizeTests(unittest.TestCase):
    def test_numbers_are_finite_python_values_or_none(self) -> None:
        self.assertEqual(to_float("12.5"), 12.5)
        for bad in (None, NAN, INF, -INF, "Infinity", "n/a", True, [1]):
            self.assertIsNone(to_float(bad), bad)
        self.assertEqual(to_int(41234567.0), 41234567)
        self.assertIsInstance(to_int(3.5e12), int)
        self.assertIsNone(to_int(NAN))

    def test_timestamps_become_utc_iso8601(self) -> None:
        expected = "2026-10-02T19:59:00Z"
        self.assertEqual(to_iso_utc(AS_OF), expected)
        self.assertEqual(to_iso_utc(AS_OF * 1000), expected)
        self.assertEqual(to_iso_utc("2026-10-02T19:59:00Z"), expected)
        self.assertEqual(to_iso_utc(datetime(2026, 10, 2, 15, 59, tzinfo=NEW_YORK)), expected)
        for bad in (None, "", "yesterday", NAN, True):
            self.assertIsNone(to_iso_utc(bad), bad)

    def test_daily_bars_keep_their_exchange_date(self) -> None:
        self.assertEqual(to_date_iso(datetime(2026, 10, 2, tzinfo=TOKYO)), "2026-10-02T00:00:00Z")
        self.assertIsNone(to_date_iso("2026-10-02"))


class ClassifyErrorTests(unittest.TestCase):
    def test_classification(self) -> None:
        http_error = Exception("HTTP error")
        http_error.response = types.SimpleNamespace(status_code=404)  # type: ignore[attr-defined]
        throttled = Exception("throttled")
        throttled.response = types.SimpleNamespace(status_code=429)  # type: ignore[attr-defined]
        self.assertIsInstance(classify_error(YFRateLimitError("Too Many Requests")), RateLimitedError)
        self.assertIsInstance(classify_error(RuntimeError("Too Many Requests. Rate limited.")), RateLimitedError)
        self.assertIsInstance(classify_error(throttled), RateLimitedError)
        self.assertIsInstance(classify_error(YFTzMissingError("$X: possibly delisted")), NotFoundError)
        self.assertIsInstance(classify_error(http_error), NotFoundError)
        blocked = ProxyConnectionError("CONNECT tunnel failed, response 403")
        self.assertIsInstance(classify_error(blocked), UnavailableError)
        self.assertIsInstance(classify_error(ImportError("No module named 'yfinance'")), UnavailableError)


class CacheTests(unittest.TestCase):
    def test_fresh_then_stale_then_gone(self) -> None:
        clock = FakeClock()
        cache = TTLCache(stale_window=100, clock=clock)
        cache.set("k", "v", ttl=10)
        self.assertTrue(cache.get("k").fresh)
        clock.now += 10
        hit = cache.get("k")
        self.assertEqual((hit.value, hit.fresh), ("v", False))
        clock.now += 100
        self.assertIsNone(cache.get("k"))
        self.assertEqual(len(cache), 0)

    def test_evicts_oldest_entries(self) -> None:
        cache = TTLCache(max_entries=2)
        for key in "abc":
            cache.set(key, key, ttl=60)
        self.assertIsNone(cache.get("a"))
        self.assertEqual(len(cache), 2)


class ProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.market = FakeMarket()
        self.provider = YFinanceProvider(self.market)

    def test_quote_normalization(self) -> None:
        self.market.fast_info["AAPL"] = fast_info()
        self.market.metadata["AAPL"] = {"regularMarketTime": datetime(2026, 10, 2, 15, 59, tzinfo=NEW_YORK)}
        self.assertEqual(
            self.provider.quote("AAPL"),
            {
                "symbol": "AAPL",
                "price": 231.4,
                "previousClose": 229.1,
                "change": 2.3,
                "changePercent": 1.0039,
                "currency": "USD",
                "exchange": "NMS",
                "dayHigh": 232.0,
                "dayLow": 228.7,
                "volume": 41234567,
                "marketCap": 3500000000000,
                "fiftyTwoWeekHigh": 260.1,
                "fiftyTwoWeekLow": 164.0,
                "asOf": "2026-10-02T19:59:00Z",
            },
        )

    def test_quote_tolerates_failing_optional_fields(self) -> None:
        self.market.fast_info["BTC-USD"] = fast_info(
            price=60000.0,
            regular_market_previous_close=KeyError("regularMarketPreviousClose"),
            previous_close=59000.0,
            market_cap=RuntimeError("Cannot retrieve share count"),
            day_high=NAN,
            last_volume=None,
        )
        quote = self.provider.quote("BTC-USD")
        self.assertEqual(quote["previousClose"], 59000.0)
        self.assertEqual(quote["changePercent"], 1.6949)
        self.assertIsNone(quote["marketCap"])
        self.assertIsNone(quote["dayHigh"])
        self.assertIsNone(quote["volume"])
        self.assertRegex(quote["asOf"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")  # falls back to fetch time

    def test_quote_without_previous_close_has_no_change(self) -> None:
        self.market.fast_info["VFIAX"] = fast_info(price=550.0, previous=None)
        quote = self.provider.quote("VFIAX")
        self.assertIsNone(quote["change"])
        self.assertIsNone(quote["changePercent"])

    def test_quote_without_positive_price_is_not_found(self) -> None:
        for price in (None, 0, -1, NAN):
            self.market.fast_info["ZZZ"] = fast_info(price=price)
            with self.assertRaises(NotFoundError):
                self.provider.quote("ZZZ")

    def test_history_range_mapping(self) -> None:
        self.market.history["AAPL"] = daily_frame(1.0)
        expected = {
            "1d": ("1d", "5m"),
            "1w": ("5d", "30m"),
            "1m": ("1mo", "1d"),
            "6m": ("6mo", "1d"),
            "1y": ("1y", "1d"),
            "5y": ("5y", "1wk"),
            "max": ("max", "1mo"),
        }
        self.assertEqual(HISTORY_RANGES, expected)
        for range_key, (period, interval) in expected.items():
            result = self.provider.history("AAPL", range_key)
            self.assertEqual((result["range"], result["interval"]), (range_key, interval))
            call = self.market.history_calls[-1]
            self.assertEqual((call["period"], call["interval"], call["auto_adjust"]), (period, interval, False))

    def test_history_points(self) -> None:
        self.market.history["AAPL"] = daily_frame(10.0, NAN, 12.0)
        self.market.metadata["AAPL"] = {"currency": "USD"}
        result = self.provider.history("AAPL", "1m")
        self.assertEqual(result["currency"], "USD")
        self.assertEqual(
            result["points"],
            [
                {"t": "2026-09-01T00:00:00Z", "open": 1.0, "high": 2.0, "low": 0.5, "close": 10.0, "volume": 100},
                {"t": "2026-09-03T00:00:00Z", "open": 1.0, "high": 2.0, "low": 0.5, "close": 12.0, "volume": 300},
            ],
        )

    def test_intraday_points_use_exact_utc_times(self) -> None:
        bar = datetime(2026, 10, 2, 9, 30, tzinfo=NEW_YORK)
        self.market.history["AAPL"] = FakeFrame([(bar, {"Open": 1, "High": 1, "Low": 1, "Close": 1, "Volume": NAN})])
        point = self.provider.history("AAPL", "1d")["points"][0]
        self.assertEqual(point["t"], "2026-10-02T13:30:00Z")
        self.assertIsNone(point["volume"])

    def test_history_without_closes_is_not_found(self) -> None:
        self.market.history["AAPL"] = daily_frame(NAN, None)
        with self.assertRaises(NotFoundError):
            self.provider.history("AAPL", "1y")

    @unittest.skipUnless(HAS_PANDAS, "pandas is not installed")
    def test_history_with_real_pandas_frame(self) -> None:
        import pandas as pd

        index = pd.DatetimeIndex(["2026-09-30", "2026-10-01", "2026-10-02"]).tz_localize("Asia/Tokyo")
        columns = {"Open": [1.0, 2.0, 3.0], "High": 4.0, "Low": 0.5, "Close": [1.5, NAN, 3.5], "Volume": [10, 20, 30]}
        frame = pd.DataFrame(columns, index=index)
        self.market.history["7203.T"] = frame
        points = self.provider.history("7203.T", "1y")["points"]
        self.assertEqual([p["t"] for p in points], ["2026-09-30T00:00:00Z", "2026-10-02T00:00:00Z"])
        self.assertIs(type(points[0]["volume"]), int)
        self.assertIs(type(points[0]["close"]), float)

    def test_profile_mapping(self) -> None:
        self.market.info["AAPL"] = {
            "longName": "Apple Inc.",
            "shortName": "Apple",
            "longBusinessSummary": "Designs iPhones.",
            "sector": "Technology",
            "industry": "Consumer Electronics",
            "website": "https://www.apple.com",
            "country": "United States",
            "fullTimeEmployees": 164000,
            "currency": "USD",
            "exchange": "NMS",
            "quoteType": "EQUITY",
            "marketCap": 3.5e12,
            "trailingPE": 35.1,
            "forwardPE": "Infinity",
            "dividendYield": 0.44,
            "dividendRate": 1.04,
            "regularMarketPrice": 231.4,
            "beta": NAN,
            "fiftyTwoWeekHigh": 260.1,
            "fiftyTwoWeekLow": 164.0,
            "averageVolume": 50000000,
        }
        self.assertEqual(
            self.provider.profile("AAPL"),
            {
                "symbol": "AAPL",
                "name": "Apple Inc.",
                "description": "Designs iPhones.",
                "sector": "Technology",
                "industry": "Consumer Electronics",
                "website": "https://www.apple.com",
                "country": "United States",
                "employees": 164000,
                "currency": "USD",
                "exchange": "NMS",
                "quoteType": "EQUITY",
                "marketCap": 3500000000000,
                "trailingPE": 35.1,
                "forwardPE": None,
                "dividendYield": 0.44,
                "beta": None,
                "fiftyTwoWeekHigh": 260.1,
                "fiftyTwoWeekLow": 164.0,
                "averageVolume": 50000000,
            },
        )

    def test_profile_fallbacks_for_funds(self) -> None:
        self.market.info["VFIAX"] = {
            "shortName": "Vanguard 500 Index Admiral",
            "description": "Tracks the S&P 500.",
            "quoteType": "MUTUALFUND",
            "website": "javascript:alert(1)",
            "navPrice": 550.0,
        }
        profile = self.provider.profile("VFIAX")
        self.assertEqual(profile["name"], "Vanguard 500 Index Admiral")
        self.assertEqual(profile["description"], "Tracks the S&P 500.")
        self.assertIsNone(profile["website"])
        self.assertIsNone(profile["sector"])

    def test_dividend_yield_is_normalised_to_percent(self) -> None:
        cases = [
            ({"dividendYield": 0.0044, "dividendRate": 1.04, "regularMarketPrice": 231.4}, 0.44),
            ({"dividendYield": 0.44, "dividendRate": 1.04, "regularMarketPrice": 231.4}, 0.44),
            ({"dividendYield": 0.035, "trailingAnnualDividendYield": 0.034}, 3.5),
            ({"dividendYield": 3.5, "trailingAnnualDividendYield": 0.034}, 3.5),
            ({"dividendYield": 2.1}, 2.1),
            ({"dividendYield": None}, None),
        ]
        for extra, expected in cases:
            self.market.info["T"] = {"longName": "Test", **extra}
            self.assertEqual(self.provider.profile("T")["dividendYield"], expected, extra)

    def test_empty_profile_is_not_found(self) -> None:
        for info in ({}, {"trailingPegRatio": None}, None):
            self.market.info["ZZZ"] = info
            with self.assertRaises(NotFoundError):
                self.provider.profile("ZZZ")

    def test_news_mapping_handles_both_shapes(self) -> None:
        self.market.news["AAPL"] = [
            {  # current nested shape
                "id": "1",
                "content": {
                    "title": " Apple ships a thing ",
                    "summary": "Summary.",
                    "pubDate": "2026-10-01T12:00:00Z",
                    "provider": {"displayName": "Reuters"},
                    "canonicalUrl": {"url": "https://finance.yahoo.com/news/apple-1"},
                    "clickThroughUrl": {"url": "https://example.com/apple-1"},
                },
            },
            {  # nested shape without canonical URL
                "id": "2",
                "content": {
                    "title": "Second",
                    "provider": {"displayName": "AP"},
                    "canonicalUrl": None,
                    "clickThroughUrl": {"url": "https://example.com/second"},
                },
            },
            {  # legacy flat shape
                "title": "Legacy headline",
                "publisher": "Motley Fool",
                "link": "https://example.com/legacy",
                "providerPublishTime": AS_OF,
            },
            {"title": "No link", "publisher": "X"},
            {"title": "Bad scheme", "link": "javascript:alert(1)"},
            {"content": {"title": "", "canonicalUrl": {"url": "https://example.com/untitled"}}},
            {"title": "Duplicate", "link": "https://example.com/legacy"},
            "garbage",
        ]
        self.assertEqual(
            self.provider.news("AAPL"),
            [
                {
                    "title": "Apple ships a thing",
                    "publisher": "Reuters",
                    "url": "https://finance.yahoo.com/news/apple-1",
                    "publishedAt": "2026-10-01T12:00:00Z",
                    "summary": "Summary.",
                },
                {
                    "title": "Second",
                    "publisher": "AP",
                    "url": "https://example.com/second",
                    "publishedAt": None,
                    "summary": None,
                },
                {
                    "title": "Legacy headline",
                    "publisher": "Motley Fool",
                    "url": "https://example.com/legacy",
                    "publishedAt": "2026-10-02T19:59:00Z",
                    "summary": None,
                },
            ],
        )

    def test_lazy_import_uses_installed_module_and_surfaces_network_errors(self) -> None:
        fake_module = types.ModuleType("yfinance")
        debug = types.SimpleNamespace(hide_exceptions=True)
        fake_module.Ticker = self.market  # type: ignore[attr-defined]
        fake_module.config = types.SimpleNamespace(debug=debug)  # type: ignore[attr-defined]
        self.market.fast_info["AAPL"] = fast_info()
        with mock.patch.dict(sys.modules, {"yfinance": fake_module}):
            self.assertTrue(yfinance_available())
            self.assertEqual(YFinanceProvider().quote("AAPL")["price"], 231.4)
        self.assertFalse(debug.hide_exceptions)

    def test_missing_yfinance_raises_import_error(self) -> None:
        with mock.patch.dict(sys.modules, {"yfinance": None}):
            self.assertFalse(yfinance_available())
            with self.assertRaises(ImportError):
                YFinanceProvider().quote("AAPL")


# --- HTTP tests -------------------------------------------------------------------------------


class HttpTestCase(unittest.TestCase):
    """Starts the real HTTP server on an ephemeral port, backed by a fake yfinance."""

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def setUp(self) -> None:
        self.market = FakeMarket()
        self.market.fast_info["AAPL"] = fast_info()
        self.market.fast_info["MSFT"] = fast_info(price=400.0, previous=500.0)
        self.market.history["AAPL"] = daily_frame(10.0, 11.0)
        self.market.info["AAPL"] = {"longName": "Apple Inc.", "regularMarketPrice": 231.4}
        self.market.news["AAPL"] = [
            {"title": f"Headline {n}", "publisher": "Wire", "link": f"https://example.com/{n}"} for n in range(10)
        ]
        self.clock = FakeClock()

    def start(
        self, *, token: Optional[str] = None, timeout: float = 5.0, provider: Optional[YFinanceProvider] = None
    ) -> None:
        service = MarketDataService(
            provider or YFinanceProvider(self.market), TTLCache(clock=self.clock), timeout=timeout, clock=self.clock
        )
        server = create_server(service, "127.0.0.1", 0, token=token)
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 5)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        self.base_url = f"http://127.0.0.1:{server.server_address[1]}"

    def request(
        self, path: str, *, headers: Optional[dict[str, str]] = None, method: str = "GET"
    ) -> tuple[int, Message, Any]:
        request = urllib.request.Request(self.base_url + path, headers=headers or {}, method=method)
        try:
            with self.opener.open(request, timeout=10) as response:
                return response.status, response.headers, json.loads(response.read() or b"null")
        except urllib.error.HTTPError as error:
            with error:
                return error.code, error.headers, json.loads(error.read() or b"null")

    def fetch(self, path: str, **kwargs: Any) -> tuple[int, Any]:
        """Like :meth:`request`, returning only ``(status, body)``."""
        status, _, body = self.request(path, **kwargs)
        return status, body


class HttpApiTests(HttpTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.start()

    def test_health(self) -> None:
        status, headers, body = self.request("/health")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "application/json; charset=utf-8")
        expected = {
            "status": "ok",
            "provider": "yfinance",
            "yfinanceAvailable": yfinance_available(),
            "version": __version__,
        }
        self.assertEqual(body, expected)

    def test_health_works_without_yfinance(self) -> None:
        with mock.patch.dict(sys.modules, {"yfinance": None}):
            status, _, body = self.request("/health")
        self.assertEqual(status, 200)
        self.assertFalse(body["yfinanceAvailable"])

    def test_quotes_batch_with_partial_errors(self) -> None:
        self.market.fast_info["BROKE"] = ProxyConnectionError("CONNECT tunnel failed, response 403")
        status, _, body = self.request("/v1/quotes?symbols=aapl,FAKE,%5EGSPC,BROKE,AAPL,MSFT")
        self.assertEqual(status, 200)
        self.assertEqual([q["symbol"] for q in body["quotes"]], ["AAPL", "MSFT"])
        self.assertEqual(body["errors"], {"FAKE": "not_found", "^GSPC": "not_found", "BROKE": "unavailable"})
        msft = body["quotes"][1]
        self.assertEqual((msft["change"], msft["changePercent"], msft["stale"]), (-100.0, -20.0, False))

    def test_quotes_all_not_found(self) -> None:
        expected = {"error": "not_found", "errors": {"FAKE": "not_found", "NOPE": "not_found"}}
        self.assertEqual(self.fetch("/v1/quotes?symbols=FAKE,NOPE"), (404, expected))

    def test_quotes_all_failed_upstream(self) -> None:
        self.market.fast_info["AAPL"] = ProxyConnectionError("blocked")
        expected = {"error": "unavailable", "errors": {"AAPL": "unavailable", "FAKE": "not_found"}}
        self.assertEqual(self.fetch("/v1/quotes?symbols=AAPL,FAKE"), (503, expected))

    def test_symbol_validation(self) -> None:
        too_many = ",".join(f"S{n}" for n in range(41))
        for path in (
            "/v1/quotes",
            "/v1/quotes?symbols=",
            "/v1/quotes?symbols=AAPL,BAD%20SYM",
            "/v1/quotes?symbols=" + "A" * 16,
            "/v1/history?symbol=AAPL;DROP",
            "/v1/profile?symbol=AA%0APL",
            "/v1/news",
        ):
            self.assertEqual(self.fetch(path), (400, {"error": "invalid_symbol"}), path)
        expected = {"error": "too_many_symbols", "max": 40}
        self.assertEqual(self.fetch("/v1/quotes?symbols=" + too_many), (400, expected))

    def test_parameter_validation(self) -> None:
        self.assertEqual(self.fetch("/v1/history?symbol=AAPL&range=2y"), (400, {"error": "invalid_range"}))
        for limit in ("0", "21", "abc", "-1"):
            status, _, body = self.request(f"/v1/news?symbol=AAPL&limit={limit}")
            self.assertEqual((status, body["error"]), (400, "invalid_limit"), limit)

    def test_history_profile_news(self) -> None:
        status, _, body = self.request("/v1/history?symbol=aapl&range=1m")
        self.assertEqual(status, 200)
        self.assertEqual((body["symbol"], body["range"], body["interval"], body["stale"]), ("AAPL", "1m", "1d", False))
        self.assertEqual(len(body["points"]), 2)
        status, _, body = self.request("/v1/history?symbol=AAPL")
        self.assertEqual((status, body["range"]), (200, "1y"))

        status, _, body = self.request("/v1/profile?symbol=AAPL")
        self.assertEqual((status, body["name"], body["stale"]), (200, "Apple Inc.", False))

        status, _, body = self.request("/v1/news?symbol=AAPL")
        self.assertEqual((status, len(body["items"]), body["stale"]), (200, 6, False))
        status, _, body = self.request("/v1/news?symbol=AAPL&limit=3")
        self.assertEqual([item["title"] for item in body["items"]], ["Headline 0", "Headline 1", "Headline 2"])

    def test_empty_news_is_ok(self) -> None:
        self.market.news["MSFT"] = []
        expected = {"symbol": "MSFT", "items": [], "stale": False}
        self.assertEqual(self.fetch("/v1/news?symbol=MSFT"), (200, expected))

    def test_unknown_symbol_is_404(self) -> None:
        for path in ("/v1/history?symbol=FAKE&range=1y", "/v1/profile?symbol=FAKE", "/v1/news?symbol=FAKE"):
            self.assertEqual(self.fetch(path), (404, {"error": "not_found"}), path)

    def test_upstream_exception_is_503(self) -> None:
        error = ProxyConnectionError("CONNECT tunnel failed, response 403")
        self.market.history["AAPL"] = self.market.info["AAPL"] = self.market.news["AAPL"] = error
        for path in ("/v1/history?symbol=AAPL&range=1y", "/v1/profile?symbol=AAPL", "/v1/news?symbol=AAPL"):
            self.assertEqual(self.fetch(path), (503, {"error": "unavailable"}), path)

    def test_rate_limit_is_503_with_retry_after_and_pauses_upstream(self) -> None:
        self.market.info["AAPL"] = YFRateLimitError("Too Many Requests. Rate limited. Try after a while.")
        status, headers, body = self.request("/v1/profile?symbol=AAPL")
        self.assertEqual((status, body), (503, {"error": "rate_limited", "retryAfter": 60}))
        self.assertEqual(headers["Retry-After"], "60")

        created = self.market.tickers_created
        self.clock.now += 45
        status, headers, body = self.request("/v1/quotes?symbols=MSFT")
        self.assertEqual((status, body["error"], body["retryAfter"]), (503, "rate_limited", 15))
        self.assertEqual(headers["Retry-After"], "15")
        self.assertEqual(self.market.tickers_created, created)  # no upstream call during the cooldown

        self.clock.now += 15
        self.assertEqual(self.request("/v1/quotes?symbols=MSFT")[0], 200)

    def test_stale_cache_is_served_when_refresh_fails(self) -> None:
        self.assertFalse(self.request("/v1/quotes?symbols=AAPL")[2]["quotes"][0]["stale"])
        self.assertFalse(self.request("/v1/history?symbol=AAPL&range=1m")[2]["stale"])
        self.market.fast_info["AAPL"] = ProxyConnectionError("blocked")
        self.market.history["AAPL"] = YFRateLimitError("Too Many Requests")

        self.clock.now += 30  # within the quote TTL: served fresh from cache, no upstream call
        self.assertFalse(self.request("/v1/quotes?symbols=AAPL")[2]["quotes"][0]["stale"])

        self.clock.now += 1800  # past both TTLs: refresh fails, the old values are served as stale
        status, _, body = self.request("/v1/quotes?symbols=AAPL")
        self.assertEqual((status, body["quotes"][0]["price"], body["quotes"][0]["stale"]), (200, 231.4, True))
        status, _, body = self.request("/v1/history?symbol=AAPL&range=1m")
        self.assertEqual((status, len(body["points"]), body["stale"]), (200, 2, True))

        self.clock.now += 24 * 3600  # beyond the stale window: nothing left to fall back on
        self.assertEqual(self.request("/v1/quotes?symbols=AAPL")[0], 503)

    def test_nan_and_infinity_become_null(self) -> None:
        self.market.fast_info["AAPL"] = fast_info(day_high=NAN, day_low=-INF, market_cap=INF, year_high=None)
        request = urllib.request.Request(self.base_url + "/v1/quotes?symbols=AAPL")
        with self.opener.open(request, timeout=10) as response:
            raw = response.read().decode()
        self.assertNotIn("NaN", raw)
        self.assertNotIn("Infinity", raw)
        quote = json.loads(raw)["quotes"][0]
        self.assertEqual([quote[k] for k in ("dayHigh", "dayLow", "marketCap", "fiftyTwoWeekHigh")], [None] * 4)

    def test_unknown_path_and_methods(self) -> None:
        self.assertEqual(self.fetch("/v2/quotes"), (404, {"error": "not_found"}))
        status, headers, body = self.request("/v1/quotes?symbols=AAPL", method="POST")
        self.assertEqual((status, body, headers["Allow"]), (405, {"error": "method_not_allowed"}, "GET"))
        status, headers, _ = self.request("/health", method="HEAD")
        self.assertEqual((status, headers["Content-Type"]), (405, "application/json; charset=utf-8"))
        status, _, body = self.request("/health", method="BREW")
        self.assertEqual((status, body), (501, {"error": "not_implemented"}))

    def test_concurrent_cold_requests_share_one_upstream_fetch(self) -> None:
        self.market.gate = threading.Event()
        results: list[int] = []

        def call() -> None:
            results.append(self.fetch("/v1/quotes?symbols=AAPL")[0])

        workers = [threading.Thread(target=call) for _ in range(5)]
        for worker in workers:
            worker.start()
        time.sleep(0.2)
        self.market.gate.set()
        for worker in workers:
            worker.join(10)
        self.assertEqual(results, [200] * 5)
        self.assertEqual(self.market.tickers_created, 1)


class HttpAuthTests(HttpTestCase):
    def test_token_required_except_for_health(self) -> None:
        self.start(token="s3cret")
        self.assertEqual(self.request("/health")[0], 200)
        self.assertEqual(self.fetch("/v1/quotes?symbols=AAPL"), (401, {"error": "unauthorized"}))
        wrong = {"X-Willow-Service-Token": "nope"}
        self.assertEqual(self.request("/v1/quotes?symbols=AAPL", headers=wrong)[0], 401)
        self.assertEqual(self.request("/v2/unknown")[0], 401)
        right = {"X-Willow-Service-Token": "s3cret"}
        self.assertEqual(self.request("/v1/quotes?symbols=AAPL", headers=right)[0], 200)


class HttpResilienceTests(HttpTestCase):
    def test_slow_upstream_times_out_with_503(self) -> None:
        self.market.gate = threading.Event()
        self.addCleanup(self.market.gate.set)
        self.start(timeout=0.3)
        started = time.monotonic()
        status, _, body = self.request("/v1/quotes?symbols=AAPL,MSFT")
        self.assertLess(time.monotonic() - started, 2)
        self.assertEqual((status, body["error"]), (503, "unavailable"))

    def test_missing_yfinance_is_503(self) -> None:
        self.start(provider=YFinanceProvider())
        with mock.patch.dict(sys.modules, {"yfinance": None}):
            self.assertEqual(self.fetch("/v1/profile?symbol=AAPL"), (503, {"error": "unavailable"}))


if __name__ == "__main__":
    unittest.main()
