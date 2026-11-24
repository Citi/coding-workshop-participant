"""Database engine, per-request sessions and the transaction helper.

The engine is created once per process and reused across warm Lambda
invocations. Aurora Serverless v2 pauses when idle and needs about 15 seconds
to resume, which the 30-second connect timeout covers.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache
from typing import Any

from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings


def build_url(settings: Settings) -> URL:
    """Build the SQLAlchemy URL for psycopg 3 from the settings."""
    return URL.create(
        "postgresql+psycopg",
        username=settings.postgres_user,
        password=settings.postgres_pass or None,
        host=settings.postgres_host,
        port=settings.postgres_port,
        database=settings.postgres_name,
    )


def build_connect_args(settings: Settings) -> dict[str, Any]:
    """Return driver connect arguments: timeout, TLS in AWS, optional search_path."""
    connect_args: dict[str, Any] = {"connect_timeout": 30}
    if not settings.is_local:
        connect_args["sslmode"] = "require"
    if settings.postgres_schema:
        connect_args["options"] = f"-csearch_path={settings.postgres_schema}"
    return connect_args


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Return the process-wide engine, creating it on first use."""
    settings = get_settings()
    return create_engine(
        build_url(settings),
        connect_args=build_connect_args(settings),
        pool_size=1,
        max_overflow=1,
        pool_pre_ping=True,
        pool_recycle=300,
    )


@lru_cache(maxsize=1)
def get_sessionmaker() -> sessionmaker[Session]:
    """Return the session factory bound to the process-wide engine."""
    return sessionmaker(bind=get_engine(), expire_on_commit=False, autoflush=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed afterwards."""
    session = get_sessionmaker()()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def transaction(session: Session) -> Iterator[Session]:
    """Run a block as one transaction: commit on success, roll back on any error."""
    try:
        yield session
        session.commit()
    except BaseException:
        session.rollback()
        raise
