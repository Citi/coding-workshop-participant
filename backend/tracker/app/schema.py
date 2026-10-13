"""
Database schema (idempotent DDL) and first-run seed data.

Nothing in this application is hard-deleted: every main table carries
``archived_at``/``archived_by`` and assignment link tables carry ``removed_at``.
"""

import logging
from datetime import date, timedelta

from psycopg import Connection

from . import config
from .db import execute, fetch_one
from .security import hash_password

logger = logging.getLogger(__name__)

_SCHEMA_READY = False

# Arbitrary constant used as the advisory-lock key so concurrent cold starts
# do not race each other while creating tables.
_SCHEMA_LOCK_KEY = 74_120_031

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    email           VARCHAR(254) NOT NULL,
    username        VARCHAR(30)  NOT NULL,
    job_title       VARCHAR(120) NOT NULL DEFAULT '',
    role            VARCHAR(10)  NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
    manager_id      INTEGER REFERENCES users(id),
    password_hash   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at     TIMESTAMPTZ,
    archived_by     INTEGER REFERENCES users(id),
    CONSTRAINT users_manager_not_self CHECK (manager_id IS NULL OR manager_id <> id)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_uq ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_manager_idx ON users (manager_id);

CREATE TABLE IF NOT EXISTS projects (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(150) NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    manager_id          INTEGER NOT NULL REFERENCES users(id),
    start_date          DATE NOT NULL,
    estimated_end_date  DATE NOT NULL,
    budget              NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
    status              VARCHAR(12) NOT NULL DEFAULT 'planned'
                        CHECK (status IN ('planned', 'active', 'on_hold', 'completed')),
    completed_at        TIMESTAMPTZ,
    created_by          INTEGER REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at         TIMESTAMPTZ,
    archived_by         INTEGER REFERENCES users(id),
    CONSTRAINT projects_dates_ck CHECK (estimated_end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS projects_manager_idx ON projects (manager_id);

CREATE TABLE IF NOT EXISTS project_members (
    project_id   INTEGER NOT NULL REFERENCES projects(id),
    user_id      INTEGER NOT NULL REFERENCES users(id),
    assigned_by  INTEGER REFERENCES users(id),
    assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_at   TIMESTAMPTZ,
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS project_members_user_idx ON project_members (user_id);

CREATE TABLE IF NOT EXISTS milestones (
    id            SERIAL PRIMARY KEY,
    project_id    INTEGER NOT NULL REFERENCES projects(id),
    name          VARCHAR(150) NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    start_date    DATE NOT NULL,
    end_date      DATE NOT NULL,
    budget        NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
    status        VARCHAR(12) NOT NULL DEFAULT 'not_started'
                  CHECK (status IN ('not_started', 'in_progress', 'completed')),
    completed_at  TIMESTAMPTZ,
    created_by    INTEGER REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at   TIMESTAMPTZ,
    archived_by   INTEGER REFERENCES users(id),
    CONSTRAINT milestones_dates_ck CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS milestones_project_idx ON milestones (project_id);

CREATE TABLE IF NOT EXISTS milestone_members (
    milestone_id  INTEGER NOT NULL REFERENCES milestones(id),
    user_id       INTEGER NOT NULL REFERENCES users(id),
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_at    TIMESTAMPTZ,
    PRIMARY KEY (milestone_id, user_id)
);

CREATE TABLE IF NOT EXISTS time_entries (
    id            SERIAL PRIMARY KEY,
    project_id    INTEGER NOT NULL REFERENCES projects(id),
    milestone_id  INTEGER REFERENCES milestones(id),
    user_id       INTEGER NOT NULL REFERENCES users(id),
    work_date     DATE NOT NULL,
    hours         NUMERIC(4, 2) NOT NULL CHECK (hours > 0 AND hours <= 24),
    note          VARCHAR(500) NOT NULL DEFAULT '',
    created_by    INTEGER REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at   TIMESTAMPTZ,
    archived_by   INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS time_entries_project_idx ON time_entries (project_id);
CREATE INDEX IF NOT EXISTS time_entries_user_idx ON time_entries (user_id, work_date);
"""


def ensure_schema(conn: Connection) -> None:
    """Create tables and seed initial data once per Lambda container."""
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with conn.transaction():
        execute(conn, "SELECT pg_advisory_xact_lock(%s)", (_SCHEMA_LOCK_KEY,))
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
        _seed(conn)
    _SCHEMA_READY = True


def reset_schema_flag() -> None:
    """Force the next request to re-run ``ensure_schema`` (used by tests)."""
    global _SCHEMA_READY
    _SCHEMA_READY = False


def _insert_user(conn: Connection, name: str, email: str, username: str, job_title: str,
                 role: str, password: str, manager_id: int | None = None) -> int:
    """Insert a user and return the new id."""
    row = fetch_one(
        conn,
        """INSERT INTO users (name, email, username, job_title, role, manager_id, password_hash)
           VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (name, email, username, job_title, role, manager_id, hash_password(password)),
    )
    return row["id"]


def _seed(conn: Connection) -> None:
    """Insert the bootstrap admin (and demo data) when the users table is empty."""
    existing = fetch_one(conn, "SELECT count(*) AS n FROM users")
    if existing and existing["n"] > 0:
        return
    logger.info("Seeding initial admin account '%s'", config.SEED_ADMIN_USERNAME)
    admin_id = _insert_user(conn, "Alex Morgan", "admin@example.com",
                            config.SEED_ADMIN_USERNAME, "Administrator", "admin",
                            config.SEED_ADMIN_PASSWORD)
    if config.SEED_DEMO_DATA:
        _seed_demo(conn, admin_id)


def _seed_demo(conn: Connection, admin_id: int) -> None:
    """Create a small, realistic data set so every role has something to see."""
    mgr_pw = "Manager123!"  # demo account, documented in README  # nosec B105
    emp_pw = "Employee123!"  # demo account, documented in README  # nosec B105
    m1 = _insert_user(conn, "Maria Lopez", "maria.lopez@example.com", "mlopez",
                      "Engineering Manager", "manager", mgr_pw)
    m2 = _insert_user(conn, "David Chen", "david.chen@example.com", "dchen",
                      "Product Manager", "manager", mgr_pw)
    e1 = _insert_user(conn, "Aisha Patel", "aisha.patel@example.com", "apatel",
                      "Software Engineer", "employee", emp_pw, m1)
    e2 = _insert_user(conn, "Jordan Smith", "jordan.smith@example.com", "jsmith",
                      "Data Analyst", "employee", emp_pw, m1)
    e3 = _insert_user(conn, "Lena Novak", "lena.novak@example.com", "lnovak",
                      "UX Designer", "employee", emp_pw, m2)
    e4 = _insert_user(conn, "Sam Okafor", "sam.okafor@example.com", "sokafor",
                      "QA Engineer", "employee", emp_pw, m2)

    today = date.today()
    start = today - timedelta(days=30)

    def project(name: str, desc: str, mgr: int, s: date, e: date, budget: int, status: str) -> int:
        return fetch_one(
            conn,
            """INSERT INTO projects (name, description, manager_id, start_date,
                   estimated_end_date, budget, status, created_by)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (name, desc, mgr, s, e, budget, status, admin_id),
        )["id"]

    p1 = project("Customer Portal Redesign", "Rebuild the customer self-service portal.",
                 m1, start, today + timedelta(days=60), 120000, "active")
    p2 = project("Data Warehouse Migration", "Move reporting to the cloud warehouse.",
                 m2, start + timedelta(days=10), today + timedelta(days=90), 80000, "active")

    for pid, uid, by in ((p1, e1, m1), (p1, e2, m1), (p1, e3, m1), (p2, e3, m2), (p2, e4, m2)):
        execute(conn, "INSERT INTO project_members (project_id, user_id, assigned_by) VALUES (%s, %s, %s)",
                (pid, uid, by))

    def milestone(pid: int, name: str, s: date, e: date, budget: int, status: str, by: int) -> int:
        return fetch_one(
            conn,
            """INSERT INTO milestones (project_id, name, start_date, end_date, budget, status, created_by)
               VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (pid, name, s, e, budget, status, by),
        )["id"]

    ms1 = milestone(p1, "Discovery & UX research", start, start + timedelta(days=20), 20000, "completed", m1)
    ms2 = milestone(p1, "MVP build", start + timedelta(days=21), today + timedelta(days=30), 70000, "in_progress", m1)
    milestone(p2, "Schema mapping", start + timedelta(days=10), today + timedelta(days=15), 25000, "in_progress", m2)
    execute(conn, "UPDATE milestones SET completed_at = now() WHERE id = %s", (ms1,))
    for mid, uid in ((ms1, e3), (ms2, e1), (ms2, e2)):
        execute(conn, "INSERT INTO milestone_members (milestone_id, user_id) VALUES (%s, %s)", (mid, uid))

    # A few weeks of logged time (weekdays only).
    for offset in range(1, 15):
        day = today - timedelta(days=offset)
        if day.weekday() >= 5:
            continue
        for pid, mid, uid, hours in ((p1, ms2, e1, 8), (p1, ms2, e2, 6), (p2, None, e4, 7)):
            execute(conn,
                    """INSERT INTO time_entries (project_id, milestone_id, user_id, work_date, hours, note, created_by)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    (pid, mid, uid, day, hours, "Seeded demo entry", uid))
