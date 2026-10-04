# Willow market-data service

A small Python microservice that serves market data (quotes, price history, company profiles
and news) to the Willow Banking Corp demo app. The Node/Express app calls it server-to-server over
HTTP on localhost. **Browsers never talk to this service directly.**

> **Demo data only.** Data comes from Yahoo Finance through the unofficial
> [yfinance](https://github.com/ranaroussi/yfinance) library. It is delayed, can be incomplete or
> wrong, is not affiliated with or endorsed by Yahoo, and is meant for demos and prototyping only.
> Do not use it for investment decisions. Willow never executes trades; nothing in this service
> places, routes or simulates orders.

- Python 3.9+. The only runtime dependency is `yfinance`; everything else is the standard library
  (`http.server`, `json`, `threading`, `logging`).
- yfinance is imported lazily, so the server starts and `/health` answers even when yfinance
  isn't installed. Data endpoints then return `503`.

## Install

```bash
python3 -m pip install -r market-data-service/requirements.txt
```

`yfinance>=1.0` is required, not just `0.2.x`. From 1.0, yfinance can be configured to raise
network errors (`yfinance.config.debug.hide_exceptions = False`, which the service sets) instead
of logging them and returning empty data. Without that, an outage would look like an unknown
symbol (404) instead of a 503.

## Run

You usually don't need to: when Willow starts (`npm start`) it checks `/health`, and if nothing
answers it launches this service itself with a generated `MARKET_DATA_TOKEN`, restarts it if it
exits and stops it when Willow stops (`src/services/market-service.js`; turn off with
`MARKET_SERVICE_AUTOSTART=false`). To run it on its own:

```bash
python3 market-data-service/server.py
# listening on 127.0.0.1:8765

MARKET_DATA_PORT=9000 MARKET_DATA_TOKEN=change-me python3 market-data-service/server.py
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `MARKET_DATA_HOST` | `127.0.0.1` | Interface to bind. Keep it on loopback; the service is not meant to be public. An IPv6 literal such as `::1` also works. |
| `MARKET_DATA_PORT` | `8765` | TCP port (`0` picks a free one). |
| `MARKET_DATA_TOKEN` | unset | When set, every request except `/health` must send the header `X-Willow-Service-Token: <token>`, otherwise `401 {"error":"unauthorized"}`. |
| `MARKET_DATA_LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` or `CRITICAL`. |

`SIGINT` (Ctrl-C) and `SIGTERM` stop the server cleanly with exit code 0. Requests still running
at that point are dropped.

Calling it from the Node app (Node 18+ has `fetch` built in):

```js
const res = await fetch('http://127.0.0.1:8765/v1/quotes?symbols=' + encodeURIComponent('AAPL,^GSPC'), {
  headers: { 'X-Willow-Service-Token': process.env.MARKET_DATA_TOKEN },
  signal: AbortSignal.timeout(12000),
});
const body = await res.json(); // every response, including errors, is JSON
```

Use `127.0.0.1` rather than `localhost`. Some Node versions resolve `localhost` to `::1` first,
and the service binds IPv4 by default.

## HTTP API

- Only `GET` is supported. Any other method returns `405 {"error":"method_not_allowed"}` with
  `Allow: GET`.
- Every response, errors included, is `Content-Type: application/json; charset=utf-8` and
  `Cache-Control: no-store`.
- Missing numbers are `null`. NaN and Infinity are never emitted.
- Timestamps are UTC ISO-8601 strings with a `Z` suffix.
- `stale: true` means the value came from the cache because a refresh failed (see
  [Caching and resilience](#caching-and-resilience)).

**Symbols** are raw Yahoo symbols, for example `AAPL`, `BRK-B`, `^GSPC`, `BTC-USD`, `EUR=X`,
`VFIAX`. Each must match `^[A-Za-z0-9.^=\-]{1,15}$`. Symbols are upper-cased, and surrounding
whitespace is ignored. URL-encode them in query strings (`^` → `%5E`, `=` → `%3D`).

### `GET /health`

No token needed. Doesn't contact Yahoo.

```json
{"status":"ok","provider":"yfinance","yfinanceAvailable":true,"version":"1.0.0"}
```

### `GET /v1/quotes?symbols=AAPL,MSFT,^GSPC`

Takes 1–40 comma-separated symbols. Duplicates are dropped, and quotes come back in request order.

```json
{
  "quotes": [
    {"symbol":"AAPL","price":231.4,"previousClose":229.1,"change":2.3,"changePercent":1.0039,
     "currency":"USD","exchange":"NMS","dayHigh":232.0,"dayLow":228.7,"volume":41234567,
     "marketCap":3500000000000,"fiftyTwoWeekHigh":260.1,"fiftyTwoWeekLow":164.0,
     "asOf":"2026-10-02T19:59:00Z","stale":false}
  ],
  "errors": {"FAKE":"not_found"}
}
```

- **Fields:**
  - Values come from yfinance's `Ticker.fast_info`.
  - `previousClose` is the regular-market previous close, falling back to `previous_close`.
  - `change` is `price - previousClose`. `changePercent` is a percentage: `1.0039` means +1.0039 %.
    Both are `null` when there's no previous close.
- **`asOf`** is Yahoo's `regularMarketTime`, the time of the last regular-market trade. It is read
  from the chart metadata that `fast_info` has already downloaded, so it costs no extra request.
  If Yahoo doesn't supply it, `asOf` is the time the service fetched the quote.
- **Missing prices:** a symbol with no price, or a price that isn't positive, counts as `not_found`.
- **`errors`** is always present. It maps each failed symbol to `not_found` or `unavailable`.
- **Status codes:**
  - `200` if at least one symbol succeeded.
  - `404 {"error":"not_found","errors":{...}}` if every symbol was unknown.
  - `503 {"error":"unavailable","errors":{...}}` if every symbol failed and at least one failed
    because of an upstream error.
  - `503 {"error":"rate_limited","retryAfter":N,"errors":{...}}` if any of those failures was
    upstream rate limiting.
- **Timing:** symbols are fetched in parallel. The whole batch waits at most 10 s, and symbols that
  aren't ready by then are reported as `unavailable`. Their fetches carry on in the background and
  are cached for the next request; this is logged once per batch at `INFO`, not as a warning.
- **Validation:** an invalid or missing symbol returns `400 {"error":"invalid_symbol"}`. More than
  40 symbols returns `400 {"error":"too_many_symbols","max":40}`.

### `GET /v1/history?symbol=AAPL&range=1y`

| `range` | yfinance period | interval | cache TTL |
| --- | --- | --- | --- |
| `1d` | `1d` | `5m` | 2 min |
| `1w` | `5d` | `30m` | 10 min |
| `1m` | `1mo` | `1d` | 30 min |
| `6m` | `6mo` | `1d` | 30 min |
| `1y` (default) | `1y` | `1d` | 30 min |
| `5y` | `5y` | `1wk` | 30 min |
| `max` | `max` | `1mo` | 30 min |

```json
{"symbol":"AAPL","range":"1y","interval":"1d","currency":"USD",
 "points":[{"t":"2025-10-02T00:00:00Z","open":226.1,"high":228.0,"low":225.3,"close":227.5,"volume":41234567}],
 "stale":false}
```

- **Source:** `Ticker.history(..., auto_adjust=False)`. Prices are not adjusted for splits or
  dividends.
- **Rows:** rows without a close are dropped. If no rows remain, the response is `404`.
- **`t` for intraday bars** (`1d`, `1w`) is the bar's start time converted to UTC.
- **`t` for daily, weekly and monthly bars** is the trading date in the exchange's time zone,
  written as midnight UTC. That keeps a Tokyo or Sydney session from moving to the previous
  calendar day when its local midnight is converted to UTC.
- **Validation:** an unknown range returns `400 {"error":"invalid_range"}`.

### `GET /v1/profile?symbol=AAPL`

```json
{"symbol":"AAPL","name":"Apple Inc.","description":"Apple Inc. designs, manufactures ...",
 "sector":"Technology","industry":"Consumer Electronics","website":"https://www.apple.com",
 "country":"United States","employees":164000,"currency":"USD","exchange":"NMS",
 "quoteType":"EQUITY","marketCap":3500000000000,"trailingPE":35.1,"forwardPE":30.2,
 "dividendYield":0.44,"beta":1.2,"fiftyTwoWeekHigh":260.1,"fiftyTwoWeekLow":164.0,
 "averageVolume":50000000,"stale":false}
```

- **Source:** values come from `Ticker.info`. Any missing field is `null`.
- **`name`** is `longName`, falling back to `shortName`.
- **`description`** is `longBusinessSummary`, falling back to `description`, which funds sometimes
  use instead.
- **`website`** is returned only if it is an `http(s)` URL.
- **`dividendYield` is always a percentage:** `0.44` means 0.44 %. Yahoo and yfinance have
  returned this field both as a fraction (`0.0044`) and as a percentage (`0.44`). The service
  checks both readings against an independent estimate and keeps the closer one. The estimate is
  `dividendRate / price`, or `trailingAnnualDividendYield` when there is no dividend rate. With no
  estimate available, the value is treated as a percentage, which is the current Yahoo format.
- **Not found:** if `info` has no name and no price-like field, the response is `404`.

### `GET /v1/news?symbol=AAPL&limit=6`

`limit` can be 1–20 and defaults to 6. Anything else returns
`400 {"error":"invalid_limit","max":20}`.

```json
{"symbol":"AAPL","items":[
  {"title":"Apple unveils ...","publisher":"Reuters","url":"https://finance.yahoo.com/news/...",
   "publishedAt":"2026-10-01T12:00:00Z","summary":"..."}
 ],"stale":false}
```

- **Shapes handled:** the current nested shape (`content.title`, `content.pubDate`,
  `content.provider.displayName`, `content.canonicalUrl.url` / `content.clickThroughUrl.url`) and
  the legacy flat shape (`title`, `publisher`, `link`, `providerPublishTime`).
- **Filtering:** only items with a title and an `http(s)` URL are returned, with duplicate URLs
  removed.
- **Empty results:** an empty list is a normal `200` with `"items": []`.

### Errors

| Status | Body | When |
| --- | --- | --- |
| 400 | `{"error":"invalid_symbol"}` (or `invalid_range`, `invalid_limit`, `too_many_symbols`) | Bad parameters. |
| 401 | `{"error":"unauthorized"}` | Token configured but missing or wrong. |
| 404 | `{"error":"not_found"}` | Unknown path, or no data for the symbol. |
| 405 | `{"error":"method_not_allowed"}` | Method other than `GET`. |
| 503 | `{"error":"unavailable"}` | Yahoo unreachable or failing, a timeout, or yfinance not installed, with no cached copy. |
| 503 | `{"error":"rate_limited","retryAfter":60}` plus a `Retry-After` header | Yahoo is rate limiting, with no cached copy. |
| 500 | `{"error":"internal_error"}` | A bug, logged with a traceback. |

## Caching and resilience

- **Cache:** an in-memory, thread-safe TTL cache keyed by endpoint and parameters. Each quote
  symbol is cached separately, and news is cached once per symbol, then trimmed to `limit`.

  | Data | TTL |
  | --- | --- |
  | Quotes | 60 s |
  | History | 2 min (`1d`), 10 min (`1w`), 30 min (other ranges) |
  | Profiles | 12 h |
  | News | 30 min |

- **Background refresh:** an entry that expired less than 5 minutes ago is returned straight away
  (`"stale": false`) while a background fetch refreshes it for the next request, so a page never
  waits on a routine refresh.
- **Stale fallback:** expired entries are kept for 24 h. When a refresh of an older entry fails for any reason
  (network error, timeout, rate limit, or even "not found"), the old value is returned with
  `200` and `"stale": true`. Only when no cached copy exists does the client get a 404 or 503.
- **Timeouts:** a request waits at most 10 s for Yahoo. A slow fetch keeps running in the
  background and fills the cache when it finishes.
- **Bounded concurrency:**
  - At most 8 upstream calls run at once.
  - Concurrent requests for the same uncached key share one upstream fetch.
  - Workers are daemon threads, so a hung Yahoo call can't block shutdown.
- **Quiet logs:** an upstream failure is logged as a warning at most once a minute per kind of
  error (`unavailable`, `rate_limited`), followed by a count of the similar failures in between,
  so an outage doesn't print a line per symbol. Unknown symbols are logged at `INFO`.
- **Rate limiting:** Yahoo rate limiting is detected by yfinance's `YFRateLimitError` class name,
  an HTTP 429, or a "Too Many Requests" message. After that, the service makes no Yahoo calls for
  60 s. It serves cached data in the meantime, or answers `rate_limited` with the remaining
  seconds in `retryAfter` and `Retry-After`.
- **Process scope:** the cache lives in the process, so restarting the service empties it.

## Logging

- **Access log:** one line per request, for example
  `INFO willow_market.http: GET /v1/quotes 200 412.3ms`. It records the method, the path without
  the query string, the status and the duration.
- **Not logged:** request headers and the service token.
- **Upstream failures:** each failure is logged once as a warning with the exception type.
- **yfinance's own logs:** warnings from yfinance (for example cookie or crumb failures during
  an outage) go to the same log.

## Tests

```bash
python3 -m unittest discover -s market-data-service/tests -v
```

- **Isolation:** the suite fakes yfinance (an injected ticker factory, or a stand-in module in
  `sys.modules`). It never touches the network and runs with or without yfinance or pandas
  installed.
- **Real HTTP:** HTTP tests start the actual server on an ephemeral port.
- **pandas:** one test uses a real pandas DataFrame and is skipped when pandas isn't installed.

## Layout

```
market-data-service/
├── server.py              entrypoint: env config, logging, signal handling
├── requirements.txt
├── willow_market/
│   ├── app.py             HTTP server, routing, validation, auth, JSON responses
│   ├── service.py         caching, request coalescing, timeouts, stale fallback, rate-limit cooldown
│   ├── provider.py        yfinance access and normalisation
│   ├── cache.py           thread-safe TTL cache with a stale window
│   ├── errors.py          not_found / unavailable / rate_limited taxonomy and classification
│   └── normalize.py       NaN-safe number, text, URL and timestamp conversion
└── tests/test_service.py
```
