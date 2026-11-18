"""
Integration fixtures: a real PostgreSQL database built from backend/db.

- Once per run: drop/create the test database and load schema.sql.
- Before every test: reload seed.sql, so each test starts from the same
  known data (9 users, 2 buildings, 7 incidents in every status).
"""

import os
from pathlib import Path

import psycopg
import pytest
from fastapi.testclient import TestClient

from tests.conftest import TEST_DB

DB_DIR = Path(__file__).resolve().parents[3] / "db"
SCHEMA_SQL = (DB_DIR / "schema.sql").read_text()
SEED_SQL = (DB_DIR / "seed.sql").read_text()
PASSWORD = "Password123!"  # every seeded account


def _conninfo(dbname: str) -> dict:
    return dict(
        host=os.environ["POSTGRES_HOST"],
        port=int(os.environ["POSTGRES_PORT"]),
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASS"],
        dbname=dbname,
        connect_timeout=5,
    )


@pytest.fixture(scope="session")
def seed_conn():
    """Create the throwaway database; yield a connection to (re)seed it."""
    try:
        admin = psycopg.connect(**_conninfo("postgres"), autocommit=True)
    except psycopg.OperationalError as exc:
        pytest.exit(f"Integration tests need PostgreSQL ({exc}).", returncode=2)
    admin.execute(f'DROP DATABASE IF EXISTS "{TEST_DB}" WITH (FORCE)')
    admin.execute(f'CREATE DATABASE "{TEST_DB}"')

    conn = psycopg.connect(**_conninfo(TEST_DB), autocommit=True)
    conn.execute(SCHEMA_SQL)
    yield conn

    conn.close()
    from app.db.session import engine
    engine.dispose()
    admin.execute(f'DROP DATABASE IF EXISTS "{TEST_DB}" WITH (FORCE)')
    admin.close()


@pytest.fixture(autouse=True)
def seeded(seed_conn):
    seed_conn.execute(SEED_SQL)


@pytest.fixture(scope="session")
def client(seed_conn):
    from app.main import app
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------- people

USERS = {
    "alice": (1, "facility_admin"),   # Facility Admin
    "ethan": (2, "engineer"),         # electrical / hvac, available
    "priya": (3, "engineer"),         # plumbing / cleaning / furniture, busy
    "tom": (4, "engineer"),           # IT / network / AV, available
    "omar": (5, "engineer"),          # on leave
    "emma": (6, "employee"),
    "liam": (7, "employee"),
    "sofia": (8, "employee"),
    "noah": (9, "employee"),
}

# Seeded incidents (ids are stable because seed.sql restarts identities)
CHAIR, LIGHTS, BADGE, AC, TAP, DOCK, WIFI = range(1, 8)


def auth_header(name: str) -> dict:
    from app.core.security import create_access_token
    uid, role = USERS[name]
    return {"Authorization": f"Bearer {create_access_token(uid, role)}"}


@pytest.fixture(scope="session")
def as_():
    """as_('emma') -> Authorization header for that seeded user."""
    cache: dict[str, dict] = {}
    return lambda name: cache.setdefault(name, auth_header(name))


@pytest.fixture
def facilities(client, as_):
    """Lookup helpers for the seeded building/floor/seat ids."""
    tree = client.get("/facilities", headers=as_("alice")).json()
    by_code = {b["code"]: b for b in tree}
    hq, inn = by_code["HQ1"], by_code["INN"]
    return {
        "hq": hq,
        "inn": inn,
        "hq_floor1": next(f for f in hq["floors"] if f["floor_number"] == 1),
        "hq_floor2": next(f for f in hq["floors"] if f["floor_number"] == 2),
        "inn_floor1": next(f for f in inn["floors"] if f["floor_number"] == 1),
    }


@pytest.fixture
def new_incident(client, as_, facilities):
    """Factory: report a fresh incident as an employee; returns the detail JSON."""
    def make(reporter="emma", **overrides):
        floor = facilities["hq_floor1"]
        body = {
            "title": "Projector has no signal",
            "description": "HDMI input shows 'no signal' in meeting room 1A.",
            "category": "audio_visual",
            "building_id": facilities["hq"]["id"],
            "floor_id": floor["id"],
            "seat_id": floor["seats"][0]["id"],
            **overrides,
        }
        r = client.post("/incidents", headers=as_(reporter), json=body)
        assert r.status_code == 201, r.text
        return r.json()
    return make


def unread(client, headers) -> list[dict]:
    return client.get("/notifications", headers=headers, params={"unread_only": True}).json()["items"]
