"""
PostgreSQL connection management and small query helpers.

A single module-level connection is reused across warm Lambda invocations
(the same pattern as the workshop example). Each request runs inside one
transaction so a failed operation never leaves partial writes behind.
"""

import logging
from contextlib import contextmanager
from typing import Any, Iterator, Optional, Sequence

from psycopg import Connection, connect
from psycopg.rows import dict_row

from . import config

logger = logging.getLogger(__name__)

_CONN: Optional[Connection] = None


def get_connection() -> Connection:
    """Return a live connection, reconnecting if the pooled one was closed or broken."""
    global _CONN
    if _CONN is None or _CONN.closed or _CONN.broken:
        _CONN = connect(config.postgres_dsn(), row_factory=dict_row, autocommit=False)
    return _CONN


def reset_connection() -> None:
    """Drop the pooled connection so the next request reconnects."""
    global _CONN
    try:
        if _CONN is not None and not _CONN.closed:
            _CONN.close()
    except Exception:  # pragma: no cover - best effort cleanup
        logger.warning("Failed closing connection", exc_info=True)
    _CONN = None


@contextmanager
def transaction() -> Iterator[Connection]:
    """Yield a connection inside a transaction; commit on success, roll back on error."""
    conn = get_connection()
    try:
        with conn.transaction():
            yield conn
    except Exception:
        if conn.broken:
            reset_connection()
        raise


def fetch_one(conn: Connection, sql: str, params: Sequence[Any] | dict | None = None) -> Optional[dict]:
    """Execute a query and return the first row as a dict (or None)."""
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def fetch_all(conn: Connection, sql: str, params: Sequence[Any] | dict | None = None) -> list[dict]:
    """Execute a query and return every row as a list of dicts."""
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return list(cur.fetchall())


def execute(conn: Connection, sql: str, params: Sequence[Any] | dict | None = None) -> int:
    """Execute a statement and return the affected row count."""
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.rowcount
