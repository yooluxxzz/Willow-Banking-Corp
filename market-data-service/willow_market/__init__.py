"""Willow market-data service: delayed Yahoo Finance data behind a small JSON HTTP API."""

import logging

__version__ = "1.0.0"

# Library convention: emit nothing unless the application (server.py) configures logging.
logging.getLogger(__name__).addHandler(logging.NullHandler())
