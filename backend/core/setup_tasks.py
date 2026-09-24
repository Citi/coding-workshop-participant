"""One-off database setup, run by invoking the Lambda directly with AWS credentials.

Aurora sits in a private network and the deploy creates no tables, so the Lambda sets up
its own database. `function.handler` sends any event with a top-level "setup_task" key
here instead of to the API:

    aws lambda invoke --function-name coding-workshop-core-<app_id> \\
      --cli-binary-format raw-in-base64-out out.json --payload \\
      '{"setup_task": "seed", "admin_email": "admin@acme.inc", "admin_password": "..."}'

Function URL requests always arrive in the HTTP event shape, which has no such key, so
the public URL can't reach this. Only someone allowed to call lambda:InvokeFunction can.
"""

import logging
from pathlib import Path
from typing import Any

from pydantic import ValidationError

import db
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

    Bad input returns {"ok": False, "error": ...} without touching the database. A
    database failure raises, so the invoke reports a FunctionError and nothing is committed.
    """
    task = event.get("setup_task")
    if task != "seed":
        return {"ok": False, "error": f"Unknown setup_task {task!r}. Known tasks: 'seed'"}

    try:
        admin = _admin_from_event(event)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}

    return _seed(admin)


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


def _seed(admin: RegisterRequest | None) -> dict[str, Any]:
    """Apply the SQL files, then create the admin if one was given and doesn't exist yet.

    All in one transaction. An existing account is left exactly as it is, password and
    role included, so re-running with a different password can't take it over.
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

    summary: dict[str, Any] = {"ok": True, "task": "seed", "sql_files": list(SEED_FILES)}
    if admin:
        summary["admin"] = {"email": admin.email, "created": created is not None}
    logger.info("Setup task finished: %s", summary)
    return summary
