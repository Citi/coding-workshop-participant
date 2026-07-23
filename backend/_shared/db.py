"""
PostgreSQL access.

Credentials come only from the POSTGRES_* environment variables Terraform
injects (see infra/locals.tf) -- nothing is hardcoded, so the same image runs
against local Postgres and Aurora without a code change.

The connection is held at module level so it survives between invocations in a
warm Lambda container, which removes a connect round-trip from most requests.
"""

import logging
import os

import psycopg2
import psycopg2.extras

logger = logging.getLogger()

# Reused across invocations in the same container; None until first use.
_CONNECTION = None


def _dsn():
    """Builds the connection string from the environment.

    Aurora requires TLS; local Postgres in the dev environment is not
    configured for it, so IS_LOCAL selects the sslmode.
    """
    is_local = os.getenv("IS_LOCAL", "false").lower() == "true"

    params = {
        "host": os.getenv("POSTGRES_HOST", "localhost"),
        "port": os.getenv("POSTGRES_PORT", "5432"),
        "dbname": os.getenv("POSTGRES_NAME", "postgres"),
        "user": os.getenv("POSTGRES_USER", "postgres"),
        "password": os.getenv("POSTGRES_PASS", ""),
        # Aurora Serverless v2 is configured with min_capacity 0 (infra/rds.tf),
        # so it scales to zero when idle and the first connection after a quiet
        # period has to wake it. Ten seconds is not enough for that -- the cold
        # request fails while the warm one right after it succeeds.
        "connect_timeout": os.getenv("POSTGRES_CONNECT_TIMEOUT", "30"),
        "sslmode": "disable" if is_local else "require",
    }
    return " ".join(f"{key}={value}" for key, value in params.items() if value != "")


def get_connection():
    """Returns a live connection, reconnecting if the pooled one has died."""
    global _CONNECTION

    if _CONNECTION is not None and _CONNECTION.closed == 0:
        return _CONNECTION

    _CONNECTION = psycopg2.connect(_dsn())
    # Explicit commits: a write that raises must not be left half-applied.
    _CONNECTION.autocommit = False
    return _CONNECTION


def _reset():
    """Drops the pooled connection so the next call reconnects."""
    global _CONNECTION
    try:
        if _CONNECTION is not None:
            _CONNECTION.close()
    except psycopg2.Error:
        pass
    finally:
        _CONNECTION = None


def query(sql, params=None, *, one=False, commit=False):
    """Runs a statement and returns dict rows.

    Args:
        sql:    parameterised SQL -- always use %s placeholders, never string
                formatting, or the query is open to injection.
        params: sequence/mapping bound to the placeholders.
        one:    return a single row (or None) instead of a list.
        commit: commit the transaction. Required for INSERT/UPDATE/DELETE.

    Returns:
        dict | list[dict] | None. Statements with nothing to return (a DELETE
        without RETURNING) yield None / [].
    """
    connection = get_connection()

    try:
        with connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            # Passing an empty sequence is NOT the same as passing None:
            # with any non-None vars psycopg2 runs placeholder interpolation
            # over the whole statement, so a literal '%' in the SQL (a comment
            # such as "-- max available %", or a LIKE pattern) raises
            # "tuple index out of range". None skips interpolation entirely.
            if params:
                cursor.execute(sql, params)
            else:
                cursor.execute(sql)

            rows = None
            if cursor.description is not None:
                rows = cursor.fetchone() if one else cursor.fetchall()

            if commit:
                connection.commit()

            # RealDictRow is a dict subclass; convert so callers can mutate and
            # json.dumps freely without depending on psycopg2 types.
            if rows is None:
                return None
            if one:
                return dict(rows) if rows else None
            return [dict(row) for row in rows]

    except psycopg2.Error:
        # Roll back before reraising: leaving the transaction aborted would
        # make every later statement on this pooled connection fail too.
        try:
            connection.rollback()
        except psycopg2.Error:
            _reset()
        raise


def execute(sql, params=None, *, one=False):
    """query() with commit=True -- the writing counterpart."""
    return query(sql, params, one=one, commit=True)


def health_check():
    """Cheap connectivity probe for the /health endpoint."""
    try:
        query("SELECT 1", one=True)
        return True
    except psycopg2.Error as exc:
        logger.warning("Database health check failed: %s", exc)
        return False
