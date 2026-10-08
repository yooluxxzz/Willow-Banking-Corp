"""HTTP layer: routing, validation, token auth and JSON responses on the standard-library server."""

from __future__ import annotations

import hmac
import json
import logging
import re
import socket
import threading
import time
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Optional
from urllib.parse import parse_qsl, urlsplit

from . import __version__
from .errors import NotFoundError, RateLimitedError, UnavailableError, UpstreamError
from .provider import HISTORY_RANGES, MAX_NEWS_ITEMS, yfinance_available
from .service import MarketDataService

logger = logging.getLogger("willow_market.http")

TOKEN_HEADER = "X-Willow-Service-Token"
SYMBOL_PATTERN = re.compile(r"[A-Za-z0-9.^=\-]{1,15}")
MAX_SYMBOLS = 40
DEFAULT_RANGE = "1y"
DEFAULT_NEWS_LIMIT = 6
_INTERNAL_ERROR_BODY = b'{"error":"internal_error"}'


@dataclass(frozen=True)
class Response:
    status: int
    body: dict[str, Any]
    headers: dict[str, str] = field(default_factory=dict)


class BadRequest(Exception):
    """A request parameter failed validation; ``code`` becomes the JSON ``error`` value."""

    def __init__(self, code: str, **details: Any) -> None:
        super().__init__(code)
        self.code = code
        self.details = details


class MarketDataApi:
    """Maps validated GET requests onto the service, and service errors onto HTTP responses."""

    def __init__(self, service: MarketDataService) -> None:
        self._service = service
        self._routes: dict[str, Callable[[Mapping[str, str]], Response]] = {
            "/health": self.health,
            "/v1/quotes": self.quotes,
            "/v1/history": self.history,
            "/v1/profile": self.profile,
            "/v1/news": self.news,
        }

    def handle(self, path: str, query: Mapping[str, str]) -> Response:
        route = self._routes.get(path)
        if route is None:
            return Response(404, {"error": "not_found"})
        try:
            return route(query)
        except BadRequest as exc:
            return Response(400, {"error": exc.code, **exc.details})
        except UpstreamError as exc:
            return _error_response(exc)

    def health(self, query: Mapping[str, str]) -> Response:
        return Response(
            200,
            {"status": "ok", "provider": "yfinance", "yfinanceAvailable": yfinance_available(), "version": __version__},
        )

    def quotes(self, query: Mapping[str, str]) -> Response:
        quotes, errors = self._service.quotes(_parse_symbols(query.get("symbols")))
        codes = {symbol: "not_found" if isinstance(e, NotFoundError) else "unavailable" for symbol, e in errors.items()}
        if quotes:
            return Response(200, {"quotes": quotes, "errors": codes})
        return _error_response(_batch_error(errors.values()), errors=codes)

    def history(self, query: Mapping[str, str]) -> Response:
        symbol = _parse_symbol(query.get("symbol"))
        range_key = (query.get("range") or DEFAULT_RANGE).strip().lower()
        if range_key not in HISTORY_RANGES:
            raise BadRequest("invalid_range")
        return Response(200, self._service.history(symbol, range_key))

    def profile(self, query: Mapping[str, str]) -> Response:
        return Response(200, self._service.profile(_parse_symbol(query.get("symbol"))))

    def news(self, query: Mapping[str, str]) -> Response:
        symbol = _parse_symbol(query.get("symbol"))
        return Response(200, self._service.news(symbol, _parse_limit(query.get("limit"))))


def _error_response(error: UpstreamError, **extra: Any) -> Response:
    """404 for unknown symbols, 503 (with Retry-After when rate limited) for upstream failures."""
    if isinstance(error, NotFoundError):
        return Response(404, {"error": "not_found", **extra})
    if isinstance(error, RateLimitedError):
        body = {"error": "rate_limited", "retryAfter": error.retry_after, **extra}
        return Response(503, body, {"Retry-After": str(error.retry_after)})
    return Response(503, {"error": "unavailable", **extra})


def _batch_error(errors: Iterable[UpstreamError]) -> UpstreamError:
    """Pick the error describing a quote batch in which every symbol failed."""
    errors = list(errors)
    if all(isinstance(error, NotFoundError) for error in errors):
        return errors[0]
    return next((error for error in errors if isinstance(error, RateLimitedError)), UnavailableError())


def _parse_symbol(raw: Optional[str]) -> str:
    candidate = (raw or "").strip()
    if not SYMBOL_PATTERN.fullmatch(candidate):
        raise BadRequest("invalid_symbol")
    return candidate.upper()


def _parse_symbols(raw: Optional[str]) -> list[str]:
    """Parse a comma-separated list: validated, upper-cased, de-duplicated in order."""
    symbols = list(dict.fromkeys(_parse_symbol(part) for part in (raw or "").split(",") if part.strip()))
    if not symbols:
        raise BadRequest("invalid_symbol")
    if len(symbols) > MAX_SYMBOLS:
        raise BadRequest("too_many_symbols", max=MAX_SYMBOLS)
    return symbols


def _parse_limit(raw: Optional[str]) -> int:
    if raw is None or raw == "":
        return DEFAULT_NEWS_LIMIT
    if not (raw.isascii() and raw.isdigit() and 1 <= int(raw) <= MAX_NEWS_ITEMS):
        raise BadRequest("invalid_limit", max=MAX_NEWS_ITEMS)
    return int(raw)


def _parse_query(raw: str) -> dict[str, str]:
    """Parse a query string, keeping the first value of repeated parameters."""
    params: dict[str, str] = {}
    for key, value in parse_qsl(raw, keep_blank_values=True):
        params.setdefault(key, value)
    return params


class MarketDataServer(ThreadingHTTPServer):
    """Threaded HTTP server carrying the API and the optional shared service token."""

    daemon_threads = True

    def __init__(self, address: tuple[str, int], api: MarketDataApi, token: Optional[str] = None) -> None:
        if ":" in address[0]:
            self.address_family = socket.AF_INET6
        super().__init__(address, MarketDataHandler)
        self.api = api
        self.token = token or None
        self._request_slots = threading.BoundedSemaphore(64)


    def process_request(self, request: socket.socket, client_address: tuple) -> None:
        if not self._request_slots.acquire(blocking=False):
            try:
                request.sendall(b'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._request_slots.release()
            raise

    def process_request_thread(self, request: socket.socket, client_address: tuple) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._request_slots.release()


class MarketDataHandler(BaseHTTPRequestHandler):
    """Answers every request with JSON and logs one line per request (never headers or tokens)."""

    server: MarketDataServer
    timeout = 30  # seconds a client may stay silent before its connection is dropped

    def version_string(self) -> str:
        return f"WillowMarketData/{__version__}"

    def do_GET(self) -> None:
        started = time.monotonic()
        status = self._send(self._route())
        self._log(status, started)

    do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_GET

    def _route(self) -> Response:
        url = urlsplit(self.path)
        path = url.path.rstrip("/") or "/"
        if path != "/health" and not self._authorized():
            return Response(401, {"error": "unauthorized"})
        if self.command != "GET":
            return Response(405, {"error": "method_not_allowed"}, {"Allow": "GET"})
        try:
            return self.server.api.handle(path, _parse_query(url.query))
        except Exception:  # last-resort guard so the client always gets JSON
            logger.exception("unhandled error for %s %s", self.command, path)
            return Response(500, {"error": "internal_error"})

    def _authorized(self) -> bool:
        expected = self.server.token
        if expected is None:
            return True
        supplied = self.headers.get(TOKEN_HEADER) or ""
        return hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8"))

    def _send(self, response: Response) -> int:
        """Write ``response`` as JSON (never NaN/Infinity) and return the status actually sent."""
        status, headers = response.status, response.headers
        try:
            body = json.dumps(response.body, allow_nan=False, ensure_ascii=False, separators=(",", ":")).encode()
        except (TypeError, ValueError):
            logger.exception("response for %s is not valid JSON", self._request_path())
            status, headers, body = 500, {}, _INTERNAL_ERROR_BODY
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            for name, value in headers.items():
                self.send_header(name, value)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            logger.debug("client disconnected before the response was written")
        return status

    def send_error(self, code: int, message: Optional[str] = None, explain: Optional[str] = None) -> None:
        """Answer protocol-level errors (malformed request, unsupported method, ...) with JSON too."""
        started = time.monotonic()
        try:
            phrase = HTTPStatus(code).phrase
        except ValueError:
            phrase = "error"
        self.close_connection = True
        error = re.sub(r"[^a-z]+", "_", phrase.lower()).strip("_")
        self._log(self._send(Response(code, {"error": error}, {"Connection": "close"})), started)

    def _request_path(self) -> str:
        """The request path without its query string ("-" if the request line was unparsable)."""
        return urlsplit(getattr(self, "path", "")).path or "-"

    def _log(self, status: int, started: float) -> None:
        elapsed_ms = (time.monotonic() - started) * 1000
        logger.info("%s %s %d %.1fms", self.command or "-", self._request_path(), status, elapsed_ms)

    def log_request(self, code: Any = "-", size: Any = "-") -> None:
        """Disabled: :meth:`_log` writes the single access-log line."""

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - signature from the base class
        logger.debug("%s - %s", self.address_string(), format % args)


def create_server(
    service: MarketDataService, host: str = "127.0.0.1", port: int = 8765, token: Optional[str] = None
) -> MarketDataServer:
    """Bind (but do not start) the HTTP server; port 0 picks a free port."""
    return MarketDataServer((host, port), MarketDataApi(service), token)
