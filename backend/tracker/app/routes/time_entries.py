"""
Time tracking endpoints.

Employees log hours against projects they are assigned to (optionally
against a milestone). Project managers and admins can log or correct time
for anyone on their projects. Totals are returned alongside every listing.
"""

from datetime import date
from decimal import Decimal
from typing import Any, Optional

from psycopg import Connection

from ..db import execute, fetch_all, fetch_one
from ..errors import ConflictError, ForbiddenError, NotFoundError
from ..metrics import hours_to_days
from ..permissions import (can_manage_project, check_time_entry_access, is_admin, is_manager,
                           is_project_member, load_project)
from ..router import Context, router
from ..validation import Validator, parse_id, query_date, query_int

ENTRY_SELECT = """
    SELECT t.*, p.name AS project_name, ms.name AS milestone_name, u.name AS user_name
    FROM time_entries t
    JOIN projects p ON p.id = t.project_id
    JOIN users u ON u.id = t.user_id
    LEFT JOIN milestones ms ON ms.id = t.milestone_id
"""

MAX_HOURS_PER_DAY = Decimal(24)


def _scope(user: dict) -> tuple[list[str], list[Any]]:
    """Row-level visibility for time entries."""
    if is_admin(user):
        return [], []
    if is_manager(user):
        return ["p.manager_id = %s", "p.archived_at IS NULL"], [user["id"]]
    return ["t.user_id = %s", "p.archived_at IS NULL"], [user["id"]]


@router.add("GET", "/time-entries")
def list_entries(ctx: Context) -> tuple[int, dict]:
    """List time entries with filters, plus totals by person and by project."""
    where, params = _scope(ctx.user)
    where.append("t.archived_at IS NULL")
    query = ctx.request.query
    for key, column in (("project_id", "t.project_id"), ("user_id", "t.user_id"), ("milestone_id", "t.milestone_id")):
        value = query_int(query, key)
        if value:
            where.append(f"{column} = %s")
            params.append(value)
    start = query_date(query, "from")
    end = query_date(query, "to")
    if start:
        where.append("t.work_date >= %s")
        params.append(start)
    if end:
        where.append("t.work_date <= %s")
        params.append(end)

    clause = " WHERE " + " AND ".join(where)
    entries = fetch_all(ctx.conn, ENTRY_SELECT + clause + " ORDER BY t.work_date DESC, t.id DESC LIMIT 500", params)
    by_user = fetch_all(ctx.conn,
                        "SELECT t.user_id, u.name AS user_name, sum(t.hours) AS hours FROM time_entries t "  # nosec B608
                        "JOIN projects p ON p.id = t.project_id JOIN users u ON u.id = t.user_id"
                        + clause + " GROUP BY t.user_id, u.name ORDER BY hours DESC", params)
    by_project = fetch_all(ctx.conn,
                           "SELECT t.project_id, p.name AS project_name, sum(t.hours) AS hours FROM time_entries t "  # nosec B608
                           "JOIN projects p ON p.id = t.project_id"
                           + clause + " GROUP BY t.project_id, p.name ORDER BY hours DESC", params)
    total = sum((r["hours"] for r in by_user), Decimal(0))
    for row in by_user + by_project:
        row["days"] = hours_to_days(row["hours"])
    return 200, {
        "entries": entries,
        "summary": {
            "total_hours": total,
            "total_days": hours_to_days(total),
            "by_user": by_user,
            "by_project": by_project,
        },
    }


def _check_daily_limit(conn: Connection, user_id: int, work_date: date, hours: Decimal,
                       exclude_id: Optional[int] = None) -> None:
    """Prevent more than 24 hours in one day for one person."""
    logged = fetch_one(conn,
                       """SELECT COALESCE(sum(hours), 0) AS h FROM time_entries
                          WHERE user_id = %s AND work_date = %s AND archived_at IS NULL AND id <> %s""",
                       (user_id, work_date, exclude_id or 0))["h"]
    if logged + hours > MAX_HOURS_PER_DAY:
        raise ConflictError(f"That would exceed 24 hours on {work_date.isoformat()} "
                            f"({logged} hours already logged).")


def _validate_milestone(conn: Connection, v: Validator, milestone_id: Optional[int], project_id: int) -> None:
    if not milestone_id:
        return
    row = fetch_one(conn, "SELECT project_id, archived_at FROM milestones WHERE id = %s", (milestone_id,))
    if row is None or row["project_id"] != project_id or row["archived_at"] is not None:
        v.add_error("milestone_id", "Select a milestone from this project.")


def _common_fields(v: Validator) -> tuple[Optional[date], Optional[Decimal], Optional[str]]:
    work_date = v.date("work_date", required=True)
    hours = v.decimal("hours", required=True, min_value=Decimal(0), exclusive_min=True, max_value=MAX_HOURS_PER_DAY)
    note = v.string("note", max_len=500)
    if work_date and work_date > date.today():
        v.add_error("work_date", "You cannot log time in the future.")
    if hours is not None and hours.as_tuple().exponent < -2:
        v.add_error("hours", "Use at most two decimal places.")
    return work_date, hours, note


@router.add("POST", "/time-entries")
def create_entry(ctx: Context) -> tuple[int, dict]:
    """Log hours for yourself, or (as project manager/admin) for a project member."""
    v = Validator(ctx.request.json())
    project_id = v.integer("project_id", required=True)
    v.raise_if_errors()
    project = load_project(ctx.conn, ctx.user, project_id)
    if project["archived_at"] is not None:
        raise ConflictError("Time cannot be logged on archived projects.")

    user_id = v.integer("user_id") or ctx.user["id"]
    milestone_id = v.integer("milestone_id")
    work_date, hours, note = _common_fields(v)
    if user_id != ctx.user["id"] and not can_manage_project(ctx.user, project):
        raise ForbiddenError("You can only log your own time.")
    if not is_project_member(ctx.conn, project_id, user_id):
        v.add_error("user_id", "This person is not assigned to the project.")
    if work_date and work_date < project["start_date"]:
        v.add_error("work_date", f"Must be on or after the project start ({project['start_date'].isoformat()}).")
    _validate_milestone(ctx.conn, v, milestone_id, project_id)
    v.raise_if_errors()
    _check_daily_limit(ctx.conn, user_id, work_date, hours)

    row = fetch_one(
        ctx.conn,
        """INSERT INTO time_entries (project_id, milestone_id, user_id, work_date, hours, note, created_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (project_id, milestone_id, user_id, work_date, hours, note or "", ctx.user["id"]),
    )
    return 201, fetch_one(ctx.conn, ENTRY_SELECT + " WHERE t.id = %s", (row["id"],))


def _load_entry(ctx: Context, write: bool) -> tuple[dict, dict]:
    entry = fetch_one(ctx.conn, "SELECT * FROM time_entries WHERE id = %s", (parse_id(ctx.params["id"]),))
    if entry is None:
        raise NotFoundError("Time entry not found.")
    project = check_time_entry_access(ctx.conn, ctx.user, entry, write)
    return entry, project


@router.add("PUT", "/time-entries/{id}")
def update_entry(ctx: Context) -> tuple[int, dict]:
    """Correct a time entry's date, hours, note or milestone."""
    entry, project = _load_entry(ctx, write=True)
    if entry["archived_at"] is not None or project["archived_at"] is not None:
        raise ConflictError("Archived time entries cannot be edited.")
    v = Validator(ctx.request.json(), partial=True)
    work_date, hours, note = _common_fields(v)
    milestone_id = v.integer("milestone_id") if v.has("milestone_id") else entry["milestone_id"]
    if work_date and work_date < project["start_date"]:
        v.add_error("work_date", f"Must be on or after the project start ({project['start_date'].isoformat()}).")
    _validate_milestone(ctx.conn, v, milestone_id, project["id"])
    v.raise_if_errors()
    _check_daily_limit(ctx.conn, entry["user_id"], work_date or entry["work_date"],
                       hours if hours is not None else entry["hours"], exclude_id=entry["id"])
    execute(ctx.conn,
            """UPDATE time_entries SET work_date = %s, hours = %s, note = %s, milestone_id = %s, updated_at = now()
               WHERE id = %s""",
            (work_date or entry["work_date"], hours if hours is not None else entry["hours"],
             note if note is not None else entry["note"], milestone_id, entry["id"]))
    return 200, fetch_one(ctx.conn, ENTRY_SELECT + " WHERE t.id = %s", (entry["id"],))


@router.add("DELETE", "/time-entries/{id}")
def archive_entry(ctx: Context) -> tuple[int, None]:
    """Archive a time entry (soft delete; admins can restore it)."""
    entry, _ = _load_entry(ctx, write=True)
    if entry["archived_at"] is not None:
        raise ConflictError("Time entry is already archived.")
    execute(ctx.conn, "UPDATE time_entries SET archived_at = now(), archived_by = %s WHERE id = %s",
            (ctx.user["id"], entry["id"]))
    return 204, None


@router.add("GET", "/projects/{id}/time-entries")
def project_entries(ctx: Context) -> tuple[int, dict]:
    """Convenience: time entries for one project (same shape as /time-entries)."""
    project = load_project(ctx.conn, ctx.user, parse_id(ctx.params["id"]))
    ctx.request.query = {**ctx.request.query, "project_id": str(project["id"])}
    if not is_admin(ctx.user) and not can_manage_project(ctx.user, project):
        ctx.request.query["user_id"] = str(ctx.user["id"])
    return list_entries(ctx)
