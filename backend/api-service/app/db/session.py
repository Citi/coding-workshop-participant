"""SQLAlchemy engine and session factory for PostgreSQL (psycopg 3 driver)."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core import config

DATABASE_URL = URL.create(
    "postgresql+psycopg",
    username=config.POSTGRES_USER,
    password=config.POSTGRES_PASS,
    host=config.POSTGRES_HOST,
    port=config.POSTGRES_PORT,
    database=config.POSTGRES_NAME,
)

# Module-level engine: its pool survives across warm Lambda invocations.
# Pool size depends on how the app runs (see config.DB_POOL_SIZE): a Lambda
# instance serves one request at a time, a long-running server up to 40.
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=config.DB_POOL_SIZE,
    max_overflow=config.DB_MAX_OVERFLOW,
    pool_timeout=config.DB_POOL_TIMEOUT,
    connect_args={"connect_timeout": 15},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base class for ORM models. Tables are created by backend/db/schema.sql."""


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session (and transaction) per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
