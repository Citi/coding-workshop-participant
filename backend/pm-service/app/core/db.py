"""PostgreSQL access: one reusable connection per Lambda container, schema bootstrap.

The connection runs in autocommit mode; the dispatcher wraps every request in
``conn.transaction()`` so a failed request never leaves partial writes behind. A connection the
server closed while the container was idle only shows up as lost when it is next used; the
dispatcher then replaces it and opens the request's transaction again (app/main.py).
"""

import logging
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from app.core.config import get_settings

logger = logging.getLogger(__name__)

SCHEMA_FILE = Path(__file__).with_name("schema.sql")
SCHEMA_LOCK_KEY = 7_270_001  # advisory lock: concurrent cold starts apply the schema one at a time

# A request may connect twice (the dispatcher reconnects once). Both waits together must end before
# CloudFront stops waiting for the API (origin_read_timeout, 60 s in infra/cloudfront.tf), so even a
# double failure reaches the client as the JSON DATABASE_UNAVAILABLE error rather than a 504 page.
# 25 s still covers an Aurora Serverless resume (about 15-20 s).
CONNECT_TIMEOUT_SECONDS = 25

_connection: psycopg.Connection | None = None
_schema_ready = False


def connect() -> psycopg.Connection:
    settings = get_settings()
    return psycopg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        dbname=settings.postgres_name,
        user=settings.postgres_user,
        password=settings.postgres_password,
        connect_timeout=CONNECT_TIMEOUT_SECONDS,
        # Local PostgreSQL runs without SSL; AWS Aurora requires it.
        sslmode="prefer" if settings.is_local else "require",
        application_name="pm-service",
        # Timestamps come back in UTC (docs/API.md), whatever the server's default time zone is.
        options="-c TimeZone=UTC",
        autocommit=True,
        row_factory=dict_row,
    )


def get_connection() -> psycopg.Connection:
    """Return the container's connection, reconnecting if it was closed or broken."""
    global _connection
    if _connection is None or connection_lost():
        _connection = connect()
    return _connection


def connection_lost() -> bool:
    """True when psycopg has found the cached connection closed or broken.

    It only finds out by using the connection: one the server ended in the meantime looks fine until then.
    """
    return _connection is not None and (_connection.closed or _connection.broken)


def reset_connection() -> None:
    """Drop the cached connection (used after connection-level failures)."""
    global _connection
    if _connection is not None:
        try:
            _connection.close()
        except Exception:  # noqa: BLE001 - closing a dead connection must never raise
            logger.debug("Ignoring error while closing a broken connection", exc_info=True)
    _connection = None


def ensure_schema(conn: psycopg.Connection, force: bool = False) -> None:
    """Create tables/indexes (idempotent) and seed default accounts on first use."""
    global _schema_ready
    if _schema_ready and not force:
        return
    from app.auth.seed import seed_default_users  # local import: avoids an import cycle

    with conn.transaction():
        conn.execute("SELECT pg_advisory_xact_lock(%s)", (SCHEMA_LOCK_KEY,))
        conn.execute(SCHEMA_FILE.read_text(encoding="utf-8"))
        seed_default_users(conn)
    _schema_ready = True
    logger.info("Database schema verified")
