"""Integration fixtures: a real PostgreSQL test database, wiped before every test."""

import psycopg
import pytest
from psycopg import sql

from app.auth.seed import seed_default_users
from app.core import db
from app.core.config import get_settings
from helpers import DEFAULT_PASSWORDS, ApiClient

TABLES = "deliverable_dependencies, deliverables, allocations, expenses, resources, projects, users"


def _create_database_if_missing() -> None:
    settings = get_settings()
    with psycopg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        dbname="postgres",
        user=settings.postgres_user,
        password=settings.postgres_password,
        autocommit=True,
    ) as admin:
        exists = admin.execute("SELECT 1 FROM pg_database WHERE datname = %s", (settings.postgres_name,)).fetchone()
        if not exists:
            admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(settings.postgres_name)))


@pytest.fixture(scope="session")
def database():
    _create_database_if_missing()
    conn = db.get_connection()
    db.ensure_schema(conn, force=True)
    return conn


@pytest.fixture(autouse=True)
def clean_database(database):
    conn = db.get_connection()
    with conn.transaction():
        conn.execute(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE")
        seed_default_users(conn)  # ids: 1 admin, 2 manager, 3 contributor, 4 viewer
    yield


@pytest.fixture
def db_conn(database):
    """Direct database access for arranging data or asserting persistence."""
    return db.get_connection()


@pytest.fixture
def api():
    return ApiClient()


@pytest.fixture
def tokens(api):
    """Access tokens for the four seeded accounts: tokens["admin"], tokens["viewer"], ..."""
    return {role: api.login(email, password) for role, (email, password) in DEFAULT_PASSWORDS.items()}
