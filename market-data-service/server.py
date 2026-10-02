#!/usr/bin/env python3
"""Run the Willow market-data service: ``python3 market-data-service/server.py`` (see README.md)."""

from __future__ import annotations

import logging
import os
import signal
import sys
import threading
from types import FrameType
from typing import Optional

from willow_market import __version__
from willow_market.app import create_server
from willow_market.provider import YFinanceProvider
from willow_market.service import MarketDataService

logger = logging.getLogger("willow_market")


def _port(raw: str) -> int:
    port = int(raw)
    if not 0 <= port <= 65535:
        raise ValueError(raw)
    return port


def main() -> int:
    level = logging.getLevelName(os.environ.get("MARKET_DATA_LOG_LEVEL", "INFO").strip().upper())
    if not isinstance(level, int):
        print("MARKET_DATA_LOG_LEVEL must be DEBUG, INFO, WARNING, ERROR or CRITICAL", file=sys.stderr)
        return 2
    logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    host = os.environ.get("MARKET_DATA_HOST", "127.0.0.1")
    try:
        port = _port(os.environ.get("MARKET_DATA_PORT", "8765"))
    except ValueError:
        logger.error("MARKET_DATA_PORT must be an integer between 0 and 65535")
        return 2
    token = os.environ.get("MARKET_DATA_TOKEN") or None

    try:
        server = create_server(MarketDataService(YFinanceProvider()), host, port, token=token)
    except OSError as exc:
        logger.error("cannot listen on %s:%d: %s", host, port, exc)
        return 1

    def request_shutdown(signum: int, _frame: Optional[FrameType]) -> None:
        logger.info("received %s, shutting down", signal.Signals(signum).name)
        # shutdown() blocks until serve_forever() returns, so it must run on another thread.
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, request_shutdown)
    signal.signal(signal.SIGTERM, request_shutdown)

    logger.info(
        "willow market-data %s listening on %s:%d (service token %s)",
        __version__,
        host,
        server.server_address[1],
        "required" if token else "not configured",
    )
    try:
        server.serve_forever()
    finally:
        server.server_close()
    logger.info("stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
