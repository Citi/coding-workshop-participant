"""Apply the idempotent DDL in ``schema.sql``."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import Engine

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def read_schema_sql() -> str:
    """Return the DDL script shipped next to this module."""
    return SCHEMA_PATH.read_text(encoding="utf-8")


def apply_schema(engine: Engine) -> None:
    """Run ``schema.sql`` as one multi-statement script on a raw psycopg connection.

    The script is executed without parameters, so psycopg uses the simple query
    protocol, which accepts several statements and dollar-quoted function bodies.
    It is deliberately not passed through ``sqlalchemy.text()``.
    """
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cursor:
            cursor.execute(read_schema_sql())
        raw.commit()
    except BaseException:
        raw.rollback()
        raise
    finally:
        raw.close()
