"""One-off database setup, run by invoking the Lambda directly with AWS credentials.

Aurora sits in a private network and the deploy creates no tables, so the Lambda sets up
its own database. `function.handler` sends any event with a top-level "setup_task" key
here instead of to the API:

    aws lambda invoke --function-name coding-workshop-core-<app_id> \\
      --cli-binary-format raw-in-base64-out out.json --payload \\
      '{"setup_task": "seed", "admin_email": "admin@acme.inc", "admin_password": "..."}'

Function URL requests always arrive in the HTTP event shape, which has no such key, so
the public URL can't reach this. Only someone allowed to call lambda:InvokeFunction can.

Add "demo_data": true to also load the mock people and tickets in demo_data.py.
"""

import logging
from pathlib import Path
from typing import Any

import psycopg
from pydantic import ValidationError

import db
import demo_data
from repositories import user_repository
from schemas import RegisterRequest
from security import hash_password

logger = logging.getLogger(__name__)

SQL_DIR = Path(__file__).resolve().parent / "sql"

# Run in this order. Each file is safe to re-run, so seeding twice changes nothing.
SEED_FILES = ("schema.sql", "seed.sql")

DEFAULT_ADMIN_NAME = "Facility Admin"


def run(event: dict[str, Any]) -> dict[str, Any]:
    """Run the task named in event["setup_task"] and return a summary for out.json.

    Bad input returns {"ok": False, "error": ...} and leaves the database unchanged. A
    database failure raises, so the invoke reports a FunctionError and nothing is committed.
    """
    task = event.get("setup_task")
    if task != "seed":
        return {"ok": False, "error": f"Unknown setup_task {task!r}. Known tasks: 'seed'"}

    with_demo_data = event.get("demo_data", False)
    if not isinstance(with_demo_data, bool):
        return {"ok": False, "error": "demo_data must be true or false"}

    try:
        admin = _admin_from_event(event)
        return _seed(admin, with_demo_data)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}


def _admin_from_event(event: dict[str, Any]) -> RegisterRequest | None:
    """Validate the optional admin account with the same rules as registration.

    Returns None when no admin_email is given, so later runs can apply schema changes
    without passing the password again. The password never appears in an error.
    """
    if not event.get("admin_email"):
        return None
    if not event.get("admin_password"):
        raise ValueError("admin_password is required when admin_email is given")
    try:
        return RegisterRequest(
            email=event["admin_email"],
            full_name=event.get("admin_name") or DEFAULT_ADMIN_NAME,
            password=event["admin_password"],
        )
    except ValidationError as exc:
        # Only field names and messages, never the input values.
        problems = "; ".join(
            f"admin_{error['loc'][0]}: {error['msg']}" for error in exc.errors()
        )
        raise ValueError(problems) from None


def _seed(admin: RegisterRequest | None, with_demo_data: bool) -> dict[str, Any]:
    """Apply the SQL files, create the admin if one was given and doesn't exist yet, then
    load the demo data if asked.

    All in one transaction, so a ValueError partway (no admin for the demo data) leaves
    nothing behind. An existing account is left exactly as it is, password and role
    included, so re-running with a different password can't take it over.
    """
    # Hash before opening the transaction; it's deliberately slow.
    password_hash = hash_password(admin.password) if admin else None
    with db.transaction() as conn:
        for name in SEED_FILES:
            conn.execute((SQL_DIR / name).read_text())
        created = None
        if admin:
            created = user_repository.insert(
                conn, admin.email, admin.full_name, None, password_hash, role="admin"
            )
        demo = None
        if with_demo_data:
            demo = demo_data.load(conn, _first_admin_id(conn))

    summary: dict[str, Any] = {"ok": True, "task": "seed", "sql_files": list(SEED_FILES)}
    if admin:
        summary["admin"] = {"email": admin.email, "created": created is not None}
    if demo:
        summary["demo_data"] = demo
    logger.info("Setup task finished: %s", summary)
    return summary


def _first_admin_id(conn: psycopg.Connection) -> int:
    """Return the longest-standing admin, who closes tickets in the demo history."""
    row = conn.execute(
        """
        SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id
        WHERE r.role_name = 'admin'
        ORDER BY u.user_id
        LIMIT 1
        """
    ).fetchone()
    if row is None:
        raise ValueError("demo_data needs an admin account: pass admin_email and admin_password")
    return row["user_id"]
