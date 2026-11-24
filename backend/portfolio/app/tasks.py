"""Database tasks run by direct Lambda invoke: ``migrate``, ``seed`` and ``reset``.

An event looks like ``{"task": "seed", "password": "<demo password>"}``. ``seed``
and ``reset`` need ``password``; an optional ``"today": "YYYY-MM-DD"`` sets the
seed's anchor date ``T`` (default: today's UTC date). A Function URL request can
never set a top-level ``task`` key, so these tasks are reachable only by a direct
invoke with IAM credentials, which ``bin/db-task.sh`` does.

The same tasks run without Lambda, against the database the ``POSTGRES_*`` and
``IS_LOCAL`` variables describe, reading the password from ``SEED_PASSWORD``::

    cd backend/portfolio && python -m app.tasks seed

Every task returns a small JSON-able summary with per-table row counts. Failures
raise, so a Lambda invoke reports a function error.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
from collections.abc import Mapping, Sequence
from datetime import date
from typing import Any

import psycopg
from sqlalchemy import Engine, func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.db.migrations import apply_schema
from app.db.models import (
    AuditLog,
    BudgetEntry,
    Deliverable,
    DeliverableDependency,
    Department,
    Project,
    ResourceAllocation,
    User,
)
from app.db.seed import seed_portfolio, today_utc
from app.db.session import get_engine, get_sessionmaker, transaction

logger = logging.getLogger(__name__)

TASK_NAMES: tuple[str, ...] = ("migrate", "seed", "reset")

# Environment variable that the command-line entry point reads the demo password from.
SEED_ENV_VAR = "SEED_PASSWORD"

# Same bounds as the API: bcrypt 5 raises on input longer than 72 bytes.
MIN_PASSWORD_BYTES = 8
MAX_PASSWORD_BYTES = 72

# Static SQL only: table names are never built into SQL at runtime. It must name every
# table in models.ALL_TABLES (a test checks this). TRUNCATE fires no row triggers, so
# the append-only audit_logs table is emptied too.
TRUNCATE_ALL_SQL = (
    "TRUNCATE audit_logs, budget_entries, resource_allocations, deliverable_dependencies, "
    "deliverables, projects, users, departments RESTART IDENTITY CASCADE"
)

# Serialises seed and reset, so two concurrent runs cannot both insert the demo data.
# The dependency service uses key 74001.
_TASK_LOCK_SQL = "SELECT pg_advisory_xact_lock(74002)"

# Models in the order the summaries list their tables.
_COUNTED_MODELS = (
    Department,
    User,
    Project,
    Deliverable,
    DeliverableDependency,
    ResourceAllocation,
    BudgetEntry,
    AuditLog,
)

# PostgreSQL SQLSTATE for "relation does not exist".
_UNDEFINED_TABLE = "42P01"

# The only accepted form of the anchor date, in ASCII digits. date.fromisoformat alone
# also takes the basic form (20261125) and ISO week dates (2026-W48-3).
_SEED_DATE_PATTERN = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")

# A bcrypt hash, whole or cut short: $2b$<cost>$<salt and digest>.
_BCRYPT_HASH_PATTERN = re.compile(r"\$2[abxy]?\$[0-9]{2}\$[./A-Za-z0-9]*")


class TaskError(RuntimeError):
    """A database task failed.

    The message is one line: no SQL parameters, no DETAIL or CONTEXT lines (they
    repeat row values) and never a bcrypt hash.
    """


def validate_password(value: Any) -> str:
    """Return the demo password if it can be used, otherwise raise ``ValueError``.

    Same rule as API passwords: 8 to 72 bytes of UTF-8, never trimmed. Error
    messages never include the password.
    """
    if value is None or value == "":
        raise ValueError(
            "The seed and reset tasks need the demo password: 'password' in the event, "
            f"or {SEED_ENV_VAR} for bin/db-task.sh and python -m app.tasks."
        )
    if not isinstance(value, str):
        raise ValueError("The demo password must be a string.")
    try:
        size = len(value.encode("utf-8"))
    except UnicodeEncodeError:
        raise ValueError("The demo password must be valid UTF-8 text.") from None
    if not MIN_PASSWORD_BYTES <= size <= MAX_PASSWORD_BYTES:
        raise ValueError(f"The demo password must be {MIN_PASSWORD_BYTES} to {MAX_PASSWORD_BYTES} bytes long.")
    return value


def parse_seed_date(value: Any) -> date | None:
    """Read the optional anchor date ``T``; ``None`` means today in UTC.

    Only ``YYYY-MM-DD`` is accepted. Other ISO 8601 forms, such as ``20261125`` or
    the week date ``2026-W48-3``, raise ``ValueError`` like any other bad value.
    """
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str) and _SEED_DATE_PATTERN.fullmatch(value):
        try:
            return date.fromisoformat(value)
        except ValueError:
            pass
    raise ValueError("'today' must be a date in YYYY-MM-DD form.")


def table_counts(session: Session) -> dict[str, int]:
    """Count the rows in every portfolio table with one query."""
    columns = [
        select(func.count()).select_from(model).scalar_subquery().label(model.__tablename__)
        for model in _COUNTED_MODELS
    ]
    row = session.execute(select(*columns)).one()
    return {name: int(count) for name, count in row._mapping.items()}


def migrate(engine: Engine | None = None) -> dict[str, Any]:
    """Apply ``schema.sql``. Safe to repeat: every statement in it is idempotent."""
    target = engine if engine is not None else get_engine()
    apply_schema(target)
    with Session(target) as session:
        counts = table_counts(session)
    return {"task": "migrate", "status": "migrated", "counts": counts}


def seed(session: Session, password: str, today: date | None = None) -> dict[str, Any]:
    """Insert the demo data in one transaction, unless a department already exists.

    Returns status ``"skipped"`` when any department exists and ``"seeded"`` after
    inserting. ``today`` is the anchor date ``T`` (default: today's UTC date).
    """
    checked = validate_password(password)
    anchor = today or today_utc()
    with transaction(session):
        session.execute(text(_TASK_LOCK_SQL))
        already_seeded = session.scalar(select(Department.id).limit(1)) is not None
        if not already_seeded:
            seed_portfolio(session, checked, anchor)
        counts = table_counts(session)
    if already_seeded:
        return {
            "task": "seed",
            "status": "skipped",
            "reason": "Departments already exist. Run the reset task to replace all data.",
            "counts": counts,
        }
    return {"task": "seed", "status": "seeded", "seed_date": anchor.isoformat(), "counts": counts}


def reset(session: Session, password: str, today: date | None = None) -> dict[str, Any]:
    """Empty every table, restart the identities and seed again, all in one transaction.

    The password is checked before anything is deleted. If seeding fails, the
    truncation is rolled back with it and the old data stays.
    """
    checked = validate_password(password)
    anchor = today or today_utc()
    with transaction(session):
        session.execute(text(_TASK_LOCK_SQL))
        session.execute(text(TRUNCATE_ALL_SQL))
        # Rows loaded earlier in this session no longer exist; forget them before the
        # new rows reuse their identities.
        session.expunge_all()
        seed_portfolio(session, checked, anchor)
        counts = table_counts(session)
    return {"task": "reset", "status": "reset", "seed_date": anchor.isoformat(), "counts": counts}


def _describe_db_error(exc: Exception) -> str:
    """Summarise a database error in one line that cannot carry a password hash.

    Only PostgreSQL's primary message is kept; for a CHECK, UNIQUE or foreign key
    violation it already names the constraint. The SQL parameters and the DETAIL
    and CONTEXT lines are dropped: a DETAIL line such as "Failing row contains (...)"
    repeats the whole row, bcrypt hash included. An error the driver raised itself
    has no server diagnostics, so only its first line is kept. Some primary messages
    quote the offending value (a failed cast, for example), so anything shaped like
    a bcrypt hash is masked as well.
    """
    original = exc.orig if isinstance(exc, DBAPIError) and exc.orig is not None else exc
    primary = getattr(getattr(original, "diag", None), "message_primary", None)
    if primary:
        reason = primary
    else:
        lines = str(original).strip().splitlines()
        reason = lines[0] if lines else ""
    reason = _BCRYPT_HASH_PATTERN.sub("[redacted]", " ".join(reason.split())) or "no details"
    if getattr(original, "sqlstate", None) == _UNDEFINED_TABLE:
        reason += " Run the migrate task first."
    return f"{type(original).__name__}: {reason}"


def run_task(event: Mapping[str, Any]) -> dict[str, Any]:
    """Dispatch a ``{"task": ...}`` event to the matching database task.

    Raises ``ValueError`` for a bad event and ``TaskError`` when the database work
    fails, so a direct Lambda invoke reports a function error either way.
    """
    if not isinstance(event, Mapping):
        raise ValueError('A task event must be a JSON object such as {"task": "migrate"}.')
    task = event.get("task")
    if task not in TASK_NAMES:
        raise ValueError(f"Unknown task {task!r}. Expected one of: {', '.join(TASK_NAMES)}.")

    logger.info("Database task %s started", task)
    try:
        if task == "migrate":
            summary = migrate()
        else:
            password = validate_password(event.get("password"))
            anchor = parse_seed_date(event.get("today"))
            runner = seed if task == "seed" else reset
            session = get_sessionmaker()()
            try:
                summary = runner(session, password, anchor)
            finally:
                session.close()
    except (DBAPIError, psycopg.Error) as exc:
        reason = _describe_db_error(exc)
        logger.error("Database task %s failed: %s", task, reason)
        raise TaskError(f"The {task} task failed: {reason}") from None
    logger.info("Database task %s finished: %s", task, json.dumps(summary))
    return summary


def main(argv: Sequence[str] | None = None) -> int:
    """Command-line entry point: ``python -m app.tasks <migrate|seed|reset> [--today YYYY-MM-DD]``.

    Reads the demo password from ``SEED_PASSWORD``, prints the JSON summary and
    returns the process exit code (0 on success).
    """
    parser = argparse.ArgumentParser(
        prog="python -m app.tasks",
        description=(
            "Run a portfolio database task against the database that the POSTGRES_* and IS_LOCAL "
            f"environment variables describe. seed and reset read the demo password from {SEED_ENV_VAR}."
        ),
    )
    parser.add_argument(
        "task",
        choices=TASK_NAMES,
        help="migrate applies schema.sql; seed inserts the demo data once; reset empties every table and seeds again",
    )
    parser.add_argument("--today", metavar="YYYY-MM-DD", help="anchor date T for the demo data (default: today, UTC)")
    args = parser.parse_args(argv)

    event: dict[str, Any] = {"task": args.task}
    if args.task != "migrate":
        password = os.environ.get(SEED_ENV_VAR, "")
        if not password:
            print(
                f"Set {SEED_ENV_VAR} first, for example: read -rs {SEED_ENV_VAR} && export {SEED_ENV_VAR}",
                file=sys.stderr,
            )
            return 2
        event["password"] = password
    if args.today:
        event["today"] = args.today

    try:
        summary = run_task(event)
    except (ValueError, TaskError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    sys.exit(main())
