"""Database tasks (migrate, seed, reset), the demo data itself and the command-line entry point.

The expected data below is copied from spec section 10 by hand, independently of
``app/db/seed.py``, so the seed is checked against the spec and not against itself.
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import subprocess
import sys
from collections.abc import Iterator
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

import bcrypt
import psycopg
import pytest
from sqlalchemy import Engine, create_engine, func, select, text
from sqlalchemy.orm import Session, aliased, sessionmaker
from sqlalchemy.pool import NullPool

from app import tasks
from app.config import get_settings
from app.db import seed as seed_module
from app.db.models import (
    ALL_TABLES,
    AuditLog,
    BudgetEntry,
    Deliverable,
    DeliverableDependency,
    Department,
    Project,
    ResourceAllocation,
    User,
)
from app.db.seed import SeedAllocation, SeedUser, seed_portfolio
from app.db.session import build_connect_args, build_url
from app.security import hash_password, verify_password
from app.tasks import TaskError, run_task

T = date(2026, 11, 25)
SEED_PASSWORD = secrets.token_urlsafe(12)
PORTFOLIO_DIR = Path(__file__).resolve().parents[2] / "backend" / "portfolio"

MODELS_BY_TABLE = {
    "departments": Department,
    "users": User,
    "projects": Project,
    "deliverables": Deliverable,
    "deliverable_dependencies": DeliverableDependency,
    "resource_allocations": ResourceAllocation,
    "budget_entries": BudgetEntry,
    "audit_logs": AuditLog,
}
EXPECTED_COUNTS = {
    "departments": 5,
    "users": 10,
    "projects": 5,
    "deliverables": 21,
    "deliverable_dependencies": 14,
    "resource_allocations": 8,
    "budget_entries": 16,
    "audit_logs": 0,
}
EMPTY_COUNTS = dict.fromkeys(EXPECTED_COUNTS, 0)

SPEC_DEPARTMENTS = ["Engineering", "Marketing", "Finance", "Operations", "Human Resources"]

# (name, email, role, department)
SPEC_USERS = [
    ("Asha Rao", "admin@acme.example", "ADMIN", "Engineering"),
    ("Vikram Shah", "pm@acme.example", "PM", "Engineering"),
    ("Rohan Das", "lead@acme.example", "LEAD", "Engineering"),
    ("Neha Kapoor", "viewer@acme.example", "VIEWER", "Finance"),
    ("Priya Nair", "priya.nair@acme.example", "LEAD", "Engineering"),
    ("Arjun Mehta", "arjun.mehta@acme.example", "LEAD", "Engineering"),
    ("Meera Iyer", "meera.iyer@acme.example", "PM", "Marketing"),
    ("Kabir Sethi", "kabir.sethi@acme.example", "PM", "Finance"),
    ("Sana Khan", "sana.khan@acme.example", "PM", "Operations"),
    ("Divya Menon", "divya.menon@acme.example", "PM", "Human Resources"),
]

ALPHA = "Project Alpha: Customer Payments Platform"
BETA = "Project Beta: Brand Relaunch Campaign"
GAMMA = "Project Gamma: Ledger Automation"
DELTA = "Project Delta: Warehouse Tracking Rollout"
EPSILON = "Project Epsilon: Onboarding Portal"

# (project, department, PM, status, start offset, end offset, planned)
SPEC_PROJECTS = [
    (ALPHA, "Engineering", "Vikram Shah", "ACTIVE", -60, 25, Decimal("400000.00")),
    (BETA, "Marketing", "Meera Iyer", "ACTIVE", -45, 50, Decimal("150000.00")),
    (GAMMA, "Finance", "Kabir Sethi", "ACTIVE", -40, 90, Decimal("250000.00")),
    (DELTA, "Operations", "Sana Khan", "ACTIVE", -70, 20, Decimal("200000.00")),
    (EPSILON, "Human Resources", "Divya Menon", "COMPLETED", -120, -10, Decimal("80000.00")),
]

# The "Spent" column.
SPEC_SPENT = {
    ALPHA: Decimal("300000.00"),
    BETA: Decimal("105000.00"),
    GAMMA: Decimal("137500.00"),
    DELTA: Decimal("210000.00"),
    EPSILON: Decimal("76000.00"),
}

# (project, category, amount)
SPEC_BUDGET_ENTRIES = [
    (ALPHA, "LABOR", Decimal("180000.00")),
    (ALPHA, "VENDOR", Decimal("60000.00")),
    (ALPHA, "SOFTWARE", Decimal("35000.00")),
    (ALPHA, "HARDWARE", Decimal("20000.00")),
    (ALPHA, "TRAVEL", Decimal("5000.00")),
    (BETA, "VENDOR", Decimal("60000.00")),
    (BETA, "LABOR", Decimal("35000.00")),
    (BETA, "SOFTWARE", Decimal("10000.00")),
    (GAMMA, "LABOR", Decimal("90000.00")),
    (GAMMA, "SOFTWARE", Decimal("40000.00")),
    (GAMMA, "OTHER", Decimal("7500.00")),
    (DELTA, "HARDWARE", Decimal("110000.00")),
    (DELTA, "LABOR", Decimal("70000.00")),
    (DELTA, "VENDOR", Decimal("30000.00")),
    (EPSILON, "LABOR", Decimal("50000.00")),
    (EPSILON, "SOFTWARE", Decimal("26000.00")),
]

# (project, title, status, completion %, due offset, assignee), in spec order.
SPEC_DELIVERABLES = [
    (ALPHA, "Requirements Sign-off", "DONE", 100, -30, "Vikram Shah"),
    (ALPHA, "API Schema", "BLOCKED", 40, -5, "Priya Nair"),
    (ALPHA, "Payments Service Integration", "IN_PROGRESS", 20, 10, "Arjun Mehta"),
    (ALPHA, "Mobile Client Integration", "NOT_STARTED", 0, 14, "Rohan Das"),
    (ALPHA, "End-to-End Testing", "NOT_STARTED", 0, 22, "Rohan Das"),
    (ALPHA, "Data Migration Plan", "IN_PROGRESS", 50, -3, "Rohan Das"),
    (BETA, "Brand Guidelines", "DONE", 100, -20, "Meera Iyer"),
    (BETA, "Campaign Creative", "IN_PROGRESS", 60, -4, "Meera Iyer"),
    (BETA, "Website Refresh", "IN_PROGRESS", 40, 20, "Meera Iyer"),
    (BETA, "Launch Event", "NOT_STARTED", 0, 35, "Meera Iyer"),
    (GAMMA, "Chart of Accounts Mapping", "DONE", 100, -15, "Kabir Sethi"),
    (GAMMA, "Reconciliation Rules Engine", "IN_PROGRESS", 70, 25, "Kabir Sethi"),
    (GAMMA, "Bank Feed Integration", "IN_PROGRESS", 50, 45, "Arjun Mehta"),
    (GAMMA, "Month-End Close Pilot", "IN_PROGRESS", 20, 70, "Kabir Sethi"),
    (DELTA, "Site Survey", "DONE", 100, -25, "Sana Khan"),
    (DELTA, "Scanner Procurement", "BLOCKED", 30, -7, "Sana Khan"),
    (DELTA, "Warehouse Staff Training", "IN_PROGRESS", 60, -2, "Sana Khan"),
    (DELTA, "Pilot Go-Live", "IN_PROGRESS", 30, 15, "Sana Khan"),
    (EPSILON, "Portal Design", "DONE", 100, -80, "Divya Menon"),
    (EPSILON, "Portal Build", "DONE", 100, -40, "Divya Menon"),
    (EPSILON, "Rollout", "DONE", 100, -12, "Divya Menon"),
]

# (predecessor, successor): the "Depends on" column.
SPEC_EDGES = {
    ("Requirements Sign-off", "API Schema"),
    ("API Schema", "Payments Service Integration"),
    ("API Schema", "Mobile Client Integration"),
    ("Payments Service Integration", "End-to-End Testing"),
    ("Brand Guidelines", "Campaign Creative"),
    ("Campaign Creative", "Website Refresh"),
    ("Campaign Creative", "Launch Event"),
    ("Chart of Accounts Mapping", "Reconciliation Rules Engine"),
    ("Reconciliation Rules Engine", "Bank Feed Integration"),
    ("Bank Feed Integration", "Month-End Close Pilot"),
    ("Site Survey", "Scanner Procurement"),
    ("Scanner Procurement", "Pilot Go-Live"),
    ("Portal Design", "Portal Build"),
    ("Portal Build", "Rollout"),
}

SPEC_BLOCKED_REASONS = {
    "API Schema": "Awaiting security approval of the partner data contract",
    "Scanner Procurement": "Vendor delivery delayed",
}

# (person, project, deliverable or None, %, from offset, to offset), in spec order.
SPEC_ALLOCATIONS = [
    ("Priya Nair", ALPHA, "API Schema", 60, -10, 20),
    ("Priya Nair", BETA, None, 60, -2, 12),
    ("Priya Nair", GAMMA, None, 50, 40, 70),
    ("Arjun Mehta", ALPHA, "Payments Service Integration", 60, -20, 9),
    ("Arjun Mehta", GAMMA, "Bank Feed Integration", 60, 10, 40),
    ("Rohan Das", ALPHA, None, 80, -30, 25),
    ("Sana Khan", DELTA, None, 70, -30, 20),
    ("Kabir Sethi", GAMMA, None, 50, -40, 90),
]

# Golden table: (completion %, utilization %) per project.
GOLDEN_PERCENTAGES = {
    ALPHA: (35.0, 75.0),
    BETA: (50.0, 70.0),
    GAMMA: (60.0, 55.0),
    DELTA: (55.0, 105.0),
    EPSILON: (100.0, 95.0),
}

MISSING = object()


def day(offset: int, anchor: date = T) -> date:
    """Return the date ``offset`` days from ``anchor``."""
    return anchor + timedelta(days=offset)


def fetch(engine: Engine, statement: Any) -> list[Any]:
    """Run one read on its own short-lived connection (an open reader would block TRUNCATE)."""
    with engine.connect() as conn:
        return list(conn.execute(statement).all())


def scalar(engine: Engine, statement: Any) -> Any:
    """Run one read that returns a single value."""
    with engine.connect() as conn:
        return conn.execute(statement).scalar_one()


def db_counts(engine: Engine) -> dict[str, int]:
    """Count every table with separate queries, independently of ``tasks.table_counts``."""
    return {name: scalar(engine, select(func.count()).select_from(model)) for name, model in MODELS_BY_TABLE.items()}


def seed_event(**extra: Any) -> dict[str, Any]:
    """A seed event with the test password and the fixed anchor date ``T``."""
    return {"task": "seed", "password": SEED_PASSWORD, "today": T.isoformat(), **extra}


def break_seed(monkeypatch: pytest.MonkeyPatch) -> None:
    """Append an allocation that breaks the 1-100 check, so seeding fails at the last table."""
    bad = SeedAllocation("Priya", "Alpha", None, 150, 0, 1)
    monkeypatch.setattr(seed_module, "ALLOCATIONS", seed_module.ALLOCATIONS + (bad,))


@pytest.fixture
def seeded(clean_db: Engine) -> Engine:
    """A clean schema seeded once with ``T`` through ``run_task``."""
    result = run_task(seed_event())
    assert result["status"] == "seeded"
    return clean_db


# --- migrate -----------------------------------------------------------------------------------


def test_migrate_twice_is_safe(clean_db: Engine) -> None:
    """Applying the schema again changes nothing and reports empty tables."""
    first = tasks.migrate()
    second = run_task({"task": "migrate"})
    assert first == second == {"task": "migrate", "status": "migrated", "counts": EMPTY_COUNTS}


def test_migrate_keeps_existing_data(seeded: Engine) -> None:
    """Migrate never drops or empties tables."""
    assert run_task({"task": "migrate"})["counts"] == EXPECTED_COUNTS
    assert db_counts(seeded) == EXPECTED_COUNTS


def test_migrate_database_error_becomes_task_error(monkeypatch: pytest.MonkeyPatch) -> None:
    """A raw psycopg error is reported as a TaskError with only its first line.

    An error the driver raised itself has no server diagnostics to read the primary
    message from, so the lines after the first (which could repeat values) are dropped.
    """

    def refuse(_engine: Engine) -> None:
        raise psycopg.errors.InsufficientPrivilege(
            "permission denied for schema public\nDETAIL:  Failing row contains (1, $2b$04$abcdefghijklmnopqrstuv)"
        )

    monkeypatch.setattr(tasks, "apply_schema", refuse)
    with pytest.raises(TaskError) as excinfo:
        run_task({"task": "migrate"})
    assert str(excinfo.value) == "The migrate task failed: InsufficientPrivilege: permission denied for schema public"


# --- seed: row counts and the data itself ------------------------------------------------------


def test_seed_inserts_exactly_the_spec_rows(clean_db: Engine) -> None:
    """5 departments, 10 users, 5 projects, 21 deliverables, 14 edges, 8 allocations, 16 entries, 0 audit rows."""
    result = run_task(seed_event())
    assert result == {"task": "seed", "status": "seeded", "seed_date": "2026-11-25", "counts": EXPECTED_COUNTS}
    assert db_counts(clean_db) == EXPECTED_COUNTS
    assert SEED_PASSWORD not in json.dumps(result)


def test_seed_portfolio_returns_inserted_counts_and_does_not_commit(db_session: Session, clean_db: Engine) -> None:
    """The low-level seeder only flushes; the caller owns the transaction."""
    inserted = seed_portfolio(db_session, SEED_PASSWORD, T)
    assert inserted == {name: count for name, count in EXPECTED_COUNTS.items() if name != "audit_logs"}
    db_session.rollback()
    assert db_counts(clean_db) == EMPTY_COUNTS


def test_seed_with_a_session_defaults_to_today_utc(db_session: Session) -> None:
    """tasks.seed(session, password) anchors the data on today's UTC date."""
    before = seed_module.today_utc()
    result = tasks.seed(db_session, SEED_PASSWORD)
    after = seed_module.today_utc()
    assert result["status"] == "seeded"
    assert result["seed_date"] in {before.isoformat(), after.isoformat()}
    anchor = date.fromisoformat(result["seed_date"])
    alpha_start = db_session.scalar(select(Project.start_date).where(Project.project_name == ALPHA))
    assert alpha_start == day(-60, anchor)


def test_departments_and_users_match_spec(seeded: Engine) -> None:
    """Names, lowercase emails, roles and departments, in spec order."""
    assert [row[0] for row in fetch(seeded, select(Department.name).order_by(Department.id))] == SPEC_DEPARTMENTS
    users = fetch(
        seeded,
        select(User.name, User.email, User.role, Department.name)
        .join(Department, User.department_id == Department.id)
        .order_by(User.id),
    )
    assert [tuple(row) for row in users] == SPEC_USERS


def test_projects_match_spec_dates_and_budgets(seeded: Engine) -> None:
    """Department, PM, status, T-relative dates and planned budget for every project."""
    rows = fetch(
        seeded,
        select(
            Project.project_name,
            Department.name,
            User.name,
            Project.status,
            Project.start_date,
            Project.end_date,
            Project.planned_budget,
        )
        .join(Department, Project.department_id == Department.id)
        .join(User, Project.project_manager_id == User.id)
        .order_by(Project.id),
    )
    expected = [
        (name, dept, pm, status, day(start), day(end), planned)
        for name, dept, pm, status, start, end, planned in SPEC_PROJECTS
    ]
    assert [tuple(row) for row in rows] == expected


def test_budget_entries_sum_to_the_spent_column(seeded: Engine) -> None:
    """Each project's entries add up to "Spent", with the spec's categories and amounts."""
    sums = fetch(
        seeded,
        select(Project.project_name, func.sum(BudgetEntry.amount))
        .join(BudgetEntry, BudgetEntry.project_id == Project.id)
        .group_by(Project.project_name),
    )
    assert dict(sums) == SPEC_SPENT
    entries = fetch(
        seeded,
        select(Project.project_name, BudgetEntry.category, BudgetEntry.amount).join(
            Project, BudgetEntry.project_id == Project.id
        ),
    )
    assert sorted(tuple(row) for row in entries) == sorted(SPEC_BUDGET_ENTRIES)


def test_budget_entry_dates_fall_between_t_minus_50_and_t_minus_5(seeded: Engine) -> None:
    """Entries are dated T-50..T-5 and never outside their project's own dates."""
    rows = fetch(
        seeded,
        select(BudgetEntry.entry_date, Project.start_date, Project.end_date).join(
            Project, BudgetEntry.project_id == Project.id
        ),
    )
    assert len(rows) == 16
    for entry_date, start, end in rows:
        assert day(-50) <= entry_date <= day(-5)
        assert start <= entry_date <= end


def test_completion_and_utilization_match_golden_table(seeded: Engine) -> None:
    """Mean deliverable completion and spent/planned reproduce the golden percentages."""
    rows = fetch(
        seeded,
        select(Project.project_name, func.avg(Deliverable.completion_percentage), Project.planned_budget)
        .join(Deliverable, Deliverable.project_id == Project.id)
        .group_by(Project.id),
    )
    for name, completion, planned in rows:
        utilization = SPEC_SPENT[name] / planned * 100
        assert (round(float(completion), 1), round(float(utilization), 1)) == GOLDEN_PERCENTAGES[name]


def test_deliverables_match_spec(seeded: Engine) -> None:
    """Status, completion, T-relative due date and assignee for all 21, in spec order; no start dates."""
    rows = fetch(
        seeded,
        select(
            Project.project_name,
            Deliverable.title,
            Deliverable.status,
            Deliverable.completion_percentage,
            Deliverable.due_date,
            User.name,
            Deliverable.start_date,
        )
        .join(Project, Deliverable.project_id == Project.id)
        .join(User, Deliverable.assigned_user_id == User.id)
        .order_by(Deliverable.id),
    )
    expected = [(p, title, status, pct, day(due), who) for p, title, status, pct, due, who in SPEC_DELIVERABLES]
    assert [tuple(row[:6]) for row in rows] == expected
    assert {row[6] for row in rows} == {None}


def test_identities_follow_spec_order(seeded: Engine) -> None:
    """Alpha is project 1 and Payments Service Integration is deliverable 3, as in the spec's examples."""
    assert scalar(seeded, select(Project.id).where(Project.project_name == ALPHA)) == 1
    assert scalar(seeded, select(Deliverable.id).where(Deliverable.title == "API Schema")) == 2
    assert scalar(seeded, select(Deliverable.id).where(Deliverable.title == "Payments Service Integration")) == 3


def test_blocked_reasons(seeded: Engine) -> None:
    """Exactly the two blocked deliverables carry the spec's reasons."""
    rows = fetch(seeded, select(Deliverable.title, Deliverable.status, Deliverable.blocked_reason))
    assert {title: reason for title, _, reason in rows if reason is not None} == SPEC_BLOCKED_REASONS
    assert {title for title, status, _ in rows if status == "BLOCKED"} == set(SPEC_BLOCKED_REASONS)


def test_dependency_edges_match_depends_on_column(seeded: Engine) -> None:
    """The 14 edges are exactly the "Depends on" column."""
    predecessor = aliased(Deliverable)
    successor = aliased(Deliverable)
    rows = fetch(
        seeded,
        select(predecessor.title, successor.title)
        .select_from(DeliverableDependency)
        .join(predecessor, DeliverableDependency.predecessor_deliverable_id == predecessor.id)
        .join(successor, DeliverableDependency.successor_deliverable_id == successor.id),
    )
    assert len(rows) == 14
    assert {tuple(row) for row in rows} == SPEC_EDGES


def test_allocations_match_spec_and_link_to_their_own_project(seeded: Engine) -> None:
    """People, projects, deliverable links, percentages and T-relative windows, in spec order."""
    rows = fetch(
        seeded,
        select(
            User.name,
            Project.project_name,
            Deliverable.title,
            ResourceAllocation.allocation_percentage,
            ResourceAllocation.start_date,
            ResourceAllocation.end_date,
            ResourceAllocation.project_id,
            Deliverable.project_id,
        )
        .select_from(ResourceAllocation)
        .join(User, ResourceAllocation.user_id == User.id)
        .join(Project, ResourceAllocation.project_id == Project.id)
        .outerjoin(Deliverable, ResourceAllocation.deliverable_id == Deliverable.id)
        .order_by(ResourceAllocation.id),
    )
    expected = [(who, p, d, pct, day(start), day(end)) for who, p, d, pct, start, end in SPEC_ALLOCATIONS]
    assert [tuple(row[:6]) for row in rows] == expected
    for row in rows:
        if row.title is not None:
            assert row[6] == row[7], f"allocation to {row.title} points at another project"


def test_priya_has_no_beta_deliverable(seeded: Engine) -> None:
    """Assigning Priya to a Beta deliverable would change Beta's score."""
    assigned = scalar(
        seeded,
        select(func.count())
        .select_from(Deliverable)
        .join(Project, Deliverable.project_id == Project.id)
        .join(User, Deliverable.assigned_user_id == User.id)
        .where(Project.project_name == BETA, User.name == "Priya Nair"),
    )
    linked = scalar(
        seeded,
        select(func.count())
        .select_from(ResourceAllocation)
        .join(Project, ResourceAllocation.project_id == Project.id)
        .join(User, ResourceAllocation.user_id == User.id)
        .where(Project.project_name == BETA, User.name == "Priya Nair", ResourceAllocation.deliverable_id.is_not(None)),
    )
    assert (assigned, linked) == (0, 0)


def test_passwords_are_stored_as_separate_bcrypt_hashes(seeded: Engine) -> None:
    """Every user gets their own salted hash of the seed password, at the configured cost."""
    hashes = [row[0] for row in fetch(seeded, select(User.password_hash))]
    assert len(hashes) == 10
    assert len(set(hashes)) == 10
    prefix = f"$2b${get_settings().bcrypt_rounds:02d}$"
    for stored in hashes:
        assert stored.startswith(prefix)
        assert SEED_PASSWORD not in stored
        assert bcrypt.checkpw(SEED_PASSWORD.encode("utf-8"), stored.encode("utf-8"))
        assert not bcrypt.checkpw(b"not-the-password", stored.encode("utf-8"))
        assert verify_password(SEED_PASSWORD, stored)


# --- seed: idempotency and failure -------------------------------------------------------------


def test_second_seed_is_skipped(seeded: Engine) -> None:
    """Once any department exists, seed changes nothing."""
    result = run_task(seed_event(today=(T + timedelta(days=3)).isoformat()))
    assert result["status"] == "skipped"
    assert result["counts"] == EXPECTED_COUNTS
    assert "seed_date" not in result
    assert scalar(seeded, select(Project.start_date).where(Project.project_name == ALPHA)) == day(-60)


def test_failed_seed_leaves_nothing_behind(clean_db: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    """Seed is one transaction: a failure on the last table rolls back every table."""
    break_seed(monkeypatch)
    with pytest.raises(TaskError) as excinfo:
        run_task(seed_event())
    message = str(excinfo.value)
    assert message.startswith("The seed task failed: CheckViolation:")
    assert "[parameters:" not in message
    assert SEED_PASSWORD not in message
    assert db_counts(clean_db) == EMPTY_COUNTS


def test_constraint_failure_never_echoes_the_failing_row(
    clean_db: Engine, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """A bad users row is reported by its constraint only.

    PostgreSQL's DETAIL line ("Failing row contains (...)") repeats the whole row,
    bcrypt hash included, so it must reach neither the TaskError (the invoke's error
    payload, which bin/db-task.sh prints) nor the log (CloudWatch).
    """
    owner = SeedUser("Zed", "Zed Example", "zed@acme.example", "OWNER", "Engineering")
    monkeypatch.setattr(seed_module, "USERS", (*seed_module.USERS, owner))
    caplog.set_level(logging.INFO, logger="app.tasks")
    with pytest.raises(TaskError) as excinfo:
        run_task(seed_event())
    reason = 'CheckViolation: new row for relation "users" violates check constraint "users_role_check"'
    assert str(excinfo.value) == f"The seed task failed: {reason}"
    assert f"Database task seed failed: {reason}" in caplog.text
    for leaked in ("$2b$", "Failing row", "DETAIL", "zed@acme.example", SEED_PASSWORD):
        assert leaked not in str(excinfo.value)
        assert leaked not in caplog.text
    assert db_counts(clean_db) == EMPTY_COUNTS


def test_a_bcrypt_hash_quoted_by_the_primary_message_is_masked(
    clean_db: Engine, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Some primary messages quote the bad value itself (a failed cast); a bcrypt hash there is masked."""
    stored = hash_password(SEED_PASSWORD)

    def cast_hash_to_integer(session: Session, _password: str, _today: date) -> dict[str, int]:
        session.execute(text("SELECT CAST(:value AS integer)"), {"value": stored})
        return {}

    monkeypatch.setattr(tasks, "seed_portfolio", cast_hash_to_integer)
    caplog.set_level(logging.INFO, logger="app.tasks")
    with pytest.raises(TaskError) as excinfo:
        run_task(seed_event())
    reason = 'InvalidTextRepresentation: invalid input syntax for type integer: "[redacted]"'
    assert str(excinfo.value) == f"The seed task failed: {reason}"
    assert f"Database task seed failed: {reason}" in caplog.text
    assert "$2b$" not in caplog.text
    assert db_counts(clean_db) == EMPTY_COUNTS


@pytest.fixture
def unmigrated_schema(clean_db: Engine, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Point the tasks' sessions at an empty schema with no tables."""
    settings = get_settings()
    schema = f"{settings.postgres_schema}_empty"
    with clean_db.connect() as conn:
        conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        conn.commit()
    connect_args = {**build_connect_args(settings), "options": f"-csearch_path={schema}"}
    engine = create_engine(build_url(settings), connect_args=connect_args, poolclass=NullPool)
    monkeypatch.setattr(tasks, "get_sessionmaker", lambda: sessionmaker(bind=engine))
    yield
    engine.dispose()
    with clean_db.connect() as conn:
        conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        conn.commit()


def test_seed_before_migrate_says_to_migrate(unmigrated_schema: None) -> None:
    """A missing table gives a TaskError that points at the migrate task."""
    with pytest.raises(TaskError, match="UndefinedTable: .*Run the migrate task first."):
        run_task(seed_event())


# --- reset -------------------------------------------------------------------------------------


def test_reset_restarts_identities_and_reseeds(seeded: Engine) -> None:
    """Reset empties every table (audit_logs too), restarts ids at 1 and seeds with the new T."""
    with Session(seeded) as session:
        session.add(Department(name="Legal"))
        session.add(AuditLog(entity_type="department", entity_id=6, action="CREATE"))
        session.commit()
    assert scalar(seeded, select(func.max(Department.id))) == 6

    new_t = T + timedelta(days=7)
    result = run_task({"task": "reset", "password": SEED_PASSWORD, "today": new_t.isoformat()})

    assert result == {"task": "reset", "status": "reset", "seed_date": new_t.isoformat(), "counts": EXPECTED_COUNTS}
    assert db_counts(seeded) == EXPECTED_COUNTS
    for name, model in MODELS_BY_TABLE.items():
        ids = [row[0] for row in fetch(seeded, select(model.id).order_by(model.id))]
        assert ids == list(range(1, EXPECTED_COUNTS[name] + 1)), name
    assert "Legal" not in {row[0] for row in fetch(seeded, select(Department.name))}
    assert scalar(seeded, select(Project.start_date).where(Project.project_name == ALPHA)) == day(-60, new_t)


def test_reset_on_an_empty_database_seeds(clean_db: Engine) -> None:
    """Reset works on a freshly migrated database too."""
    assert run_task({"task": "reset", "password": SEED_PASSWORD})["counts"] == EXPECTED_COUNTS


def test_failed_reset_keeps_the_old_data(seeded: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    """The truncate is rolled back together with the failed seed."""
    break_seed(monkeypatch)
    with pytest.raises(TaskError):
        run_task({"task": "reset", "password": SEED_PASSWORD, "today": (T + timedelta(days=3)).isoformat()})
    assert db_counts(seeded) == EXPECTED_COUNTS
    assert scalar(seeded, select(Project.start_date).where(Project.project_name == ALPHA)) == day(-60)


def test_reset_with_a_bad_password_deletes_nothing(seeded: Engine) -> None:
    """The password is checked before the truncate."""
    with pytest.raises(ValueError, match="8 to 72 bytes"):
        run_task({"task": "reset", "password": "short"})
    assert db_counts(seeded) == EXPECTED_COUNTS


def test_truncate_sql_names_every_table() -> None:
    """The static TRUNCATE statement covers every table in the schema."""
    sql = tasks.TRUNCATE_ALL_SQL
    assert sql.startswith("TRUNCATE ")
    assert sql.endswith(" RESTART IDENTITY CASCADE")
    listed = sql.removeprefix("TRUNCATE ").removesuffix(" RESTART IDENTITY CASCADE").split(",")
    assert {name.strip() for name in listed} == set(ALL_TABLES)


# --- event validation --------------------------------------------------------------------------


BAD_PASSWORDS = [
    pytest.param(MISSING, id="missing"),
    pytest.param(None, id="none"),
    pytest.param("", id="empty"),
    pytest.param("Seven7!", id="7-bytes"),
    pytest.param("a" * 73, id="73-bytes"),
    pytest.param("é" * 37, id="74-bytes-of-utf8"),
    pytest.param("\ud800" * 8, id="not-utf8"),
    pytest.param(12345678, id="number"),
    pytest.param(["password"], id="list"),
]


@pytest.mark.parametrize("task", ["seed", "reset"])
@pytest.mark.parametrize("password", BAD_PASSWORDS)
def test_bad_passwords_are_rejected_before_any_change(clean_db: Engine, task: str, password: Any) -> None:
    """seed and reset need an 8-72 byte string; the error never repeats it."""
    event: dict[str, Any] = {"task": task, "today": T.isoformat()}
    if password is not MISSING:
        event["password"] = password
    with pytest.raises(ValueError) as excinfo:
        run_task(event)
    if isinstance(password, str) and len(password) >= 4:
        assert password not in str(excinfo.value)
    assert db_counts(clean_db) == EMPTY_COUNTS


@pytest.mark.parametrize("password", ["a" * 8, "a" * 72, "é" * 4, "é" * 36, "  spaced out  "])
def test_password_byte_bounds_are_inclusive(password: str) -> None:
    """8 and 72 bytes are accepted, counted in UTF-8, and nothing is trimmed."""
    assert tasks.validate_password(password) == password


@pytest.mark.parametrize(
    "event",
    [{"task": "drop"}, {"task": "SEED"}, {"task": None}, {}, ["seed"], "migrate"],
    ids=["unknown", "wrong-case", "none", "no-task", "list", "string"],
)
def test_unknown_task_raises(event: Any) -> None:
    """Anything but migrate, seed or reset is a ValueError (a function error when invoked)."""
    with pytest.raises(ValueError):
        run_task(event)


@pytest.mark.parametrize(
    "today",
    # The last four are other ISO 8601 forms that date.fromisoformat accepts on its own.
    ["25/11/2026", "2026-13-01", 20261125, "20261125", "2026-W48-3", "2026W483", "2026-W48"],
)
def test_bad_today_is_rejected(clean_db: Engine, today: Any) -> None:
    """The optional anchor date must be exactly YYYY-MM-DD: no basic form, no ISO week date."""
    with pytest.raises(ValueError, match="YYYY-MM-DD"):
        run_task(seed_event(today=today))
    assert db_counts(clean_db) == EMPTY_COUNTS


def test_parse_seed_date_accepts_dates_and_blank() -> None:
    """A date passes through; blank means "today"."""
    assert tasks.parse_seed_date(T) == T
    assert tasks.parse_seed_date("2026-11-25") == T
    assert tasks.parse_seed_date(None) is None
    assert tasks.parse_seed_date("") is None


# --- entry points ------------------------------------------------------------------------------


def test_lambda_handler_runs_a_real_task(clean_db: Engine) -> None:
    """A direct-invoke event reaches run_task through function.handler."""
    import function

    result = function.handler(seed_event(), None)
    assert result["status"] == "seeded"
    assert result["counts"] == EXPECTED_COUNTS
    with pytest.raises(ValueError, match="Unknown task"):
        function.handler({"task": "drop-everything"}, None)


def test_cli_main_migrate(clean_db: Engine, capsys: pytest.CaptureFixture[str]) -> None:
    """``python -m app.tasks migrate`` prints the JSON summary and exits 0."""
    assert tasks.main(["migrate"]) == 0
    assert json.loads(capsys.readouterr().out) == {"task": "migrate", "status": "migrated", "counts": EMPTY_COUNTS}


def test_cli_main_seed_reads_seed_password(
    clean_db: Engine, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """The CLI reads SEED_PASSWORD, honours --today and never prints the password."""
    monkeypatch.setenv("SEED_PASSWORD", SEED_PASSWORD)
    assert tasks.main(["seed", "--today", T.isoformat()]) == 0
    captured = capsys.readouterr()
    assert json.loads(captured.out) == {
        "task": "seed",
        "status": "seeded",
        "seed_date": T.isoformat(),
        "counts": EXPECTED_COUNTS,
    }
    assert SEED_PASSWORD not in captured.out + captured.err
    stored = scalar(clean_db, select(User.password_hash).where(User.email == "admin@acme.example"))
    assert bcrypt.checkpw(SEED_PASSWORD.encode("utf-8"), stored.encode("utf-8"))


def test_cli_main_without_seed_password(
    clean_db: Engine, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """seed without SEED_PASSWORD exits 2 with a hint and changes nothing."""
    monkeypatch.delenv("SEED_PASSWORD", raising=False)
    assert tasks.main(["seed"]) == 2
    assert "SEED_PASSWORD" in capsys.readouterr().err
    assert db_counts(clean_db) == EMPTY_COUNTS


def test_cli_main_reports_invalid_input(
    clean_db: Engine, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """A short password or a bad --today exits 1 with the reason on stderr."""
    monkeypatch.setenv("SEED_PASSWORD", "Zq9!x")
    assert tasks.main(["reset"]) == 1
    err = capsys.readouterr().err
    assert "8 to 72 bytes" in err
    assert "Zq9!x" not in err
    monkeypatch.setenv("SEED_PASSWORD", SEED_PASSWORD)
    for bad_today in ("tomorrow", "2026-W48-3", "20261125"):
        assert tasks.main(["seed", "--today", bad_today]) == 1
        assert "YYYY-MM-DD" in capsys.readouterr().err
    assert db_counts(clean_db) == EMPTY_COUNTS


def test_cli_main_rejects_unknown_task() -> None:
    """argparse refuses anything but the three tasks (exit code 2)."""
    with pytest.raises(SystemExit) as excinfo:
        tasks.main(["drop"])
    assert excinfo.value.code == 2


def test_python_dash_m_entry_point(clean_db: Engine) -> None:
    """``python -m app.tasks`` works as a real process, from the service folder."""
    env = {key: value for key, value in os.environ.items() if key != "SEED_PASSWORD"}
    command = [sys.executable, "-m", "app.tasks"]
    migrated = subprocess.run(
        [*command, "migrate"], cwd=PORTFOLIO_DIR, env=env, capture_output=True, text=True, timeout=120, check=False
    )
    assert migrated.returncode == 0, migrated.stderr
    assert json.loads(migrated.stdout)["status"] == "migrated"
    refused = subprocess.run(
        [*command, "seed"], cwd=PORTFOLIO_DIR, env=env, capture_output=True, text=True, timeout=120, check=False
    )
    assert refused.returncode == 2
    assert "SEED_PASSWORD" in refused.stderr
