"""
Milestone endpoints.

Milestones are key points in a project with their own dates, budget and
assigned employees. The project's manager (or an admin) creates them,
assigns people and marks them complete.
"""

from datetime import date
from decimal import Decimal
from typing import Any, Optional

from psycopg import Connection

from ..db import execute, fetch_all, fetch_one
from ..errors import ConflictError, NotFoundError
from ..metrics import hours_to_days
from ..permissions import load_project
from ..router import Context, router
from ..validation import Validator, parse_id

MILESTONE_STATUSES = ("not_started", "in_progress", "completed")
MAX_BUDGET = Decimal("999999999999")

MILESTONE_SELECT = """
    SELECT ms.*,
        COALESCE((SELECT sum(t.hours) FROM time_entries t
                  WHERE t.milestone_id = ms.id AND t.archived_at IS NULL), 0) AS total_hours
    FROM milestones ms
"""


def _members_for(conn: Connection, milestone_ids: list[int]) -> dict[int, list[dict]]:
    """Active members for each milestone id."""
    if not milestone_ids:
        return {}
    rows = fetch_all(
        conn,
        """SELECT mm.milestone_id, u.id, u.name, u.job_title
           FROM milestone_members mm JOIN users u ON u.id = mm.user_id
           WHERE mm.milestone_id = ANY(%s) AND mm.removed_at IS NULL AND u.archived_at IS NULL
           ORDER BY u.name""",
        (milestone_ids,),
    )
    grouped: dict[int, list[dict]] = {mid: [] for mid in milestone_ids}
    for row in rows:
        grouped[row.pop("milestone_id")].append(row)
    return grouped


def _enrich(rows: list[dict], conn: Connection) -> list[dict]:
    members = _members_for(conn, [r["id"] for r in rows])
    today = date.today()
    for row in rows:
        row["members"] = members.get(row["id"], [])
        row["total_days"] = hours_to_days(row["total_hours"])
        row["is_overdue"] = row["status"] != "completed" and row["end_date"] < today
    return rows


def list_project_milestones(conn: Connection, project_id: int) -> list[dict]:
    """Active milestones for a project ordered by schedule."""
    rows = fetch_all(conn, MILESTONE_SELECT + " WHERE ms.project_id = %s AND ms.archived_at IS NULL"
                     " ORDER BY ms.start_date, ms.id", (project_id,))
    return _enrich(rows, conn)


def _load_milestone(ctx: Context, manage: bool) -> tuple[dict, dict]:
    """Load a milestone and its project, enforcing project visibility/management."""
    milestone_id = parse_id(ctx.params["id"])
    row = fetch_one(ctx.conn, MILESTONE_SELECT + " WHERE ms.id = %s", (milestone_id,))
    if row is None:
        raise NotFoundError("Milestone not found.")
    project = load_project(ctx.conn, ctx.user, row["project_id"], manage=manage)
    if row["archived_at"] is not None and ctx.user["role"] != "admin":
        raise NotFoundError("Milestone not found.")
    return row, project


def _validate(ctx: Context, v: Validator, project: dict, existing: Optional[dict]) -> dict[str, Any]:
    """Validate milestone fields against the parent project's dates, budget and members."""
    partial = existing is not None
    name = v.string("name", required=True, max_len=150)
    description = v.string("description", max_len=5000)
    start = v.date("start_date", required=True)
    end = v.date("end_date", required=True)
    budget = v.decimal("budget", min_value=Decimal(0), max_value=MAX_BUDGET)
    status = v.choice("status", MILESTONE_STATUSES)
    user_ids = v.int_list("user_ids")

    eff_start = start or (existing or {}).get("start_date")
    eff_end = end or (existing or {}).get("end_date")
    if eff_start and eff_start < project["start_date"]:
        v.add_error("start_date", f"Must be on or after the project start ({project['start_date'].isoformat()}).")
    if eff_start and eff_end and eff_end < eff_start:
        v.add_error("end_date", "End date must be on or after the start date.")

    if budget is not None:
        other = fetch_one(ctx.conn,
                          """SELECT COALESCE(sum(budget), 0) AS total FROM milestones
                             WHERE project_id = %s AND archived_at IS NULL AND id <> %s""",
                          (project["id"], (existing or {}).get("id", 0)))["total"]
        available = project["budget"] - other
        if budget > available:
            v.add_error("budget", f"Only {available:,.2f} of the project budget is unallocated.")

    if user_ids:
        valid = {r["user_id"] for r in fetch_all(
            ctx.conn,
            """SELECT pm.user_id FROM project_members pm JOIN users u ON u.id = pm.user_id
               WHERE pm.project_id = %s AND pm.removed_at IS NULL AND u.archived_at IS NULL
                 AND pm.user_id = ANY(%s)""",
            (project["id"], user_ids))}
        if set(user_ids) - valid:
            v.add_error("user_ids", "Milestone members must be assigned to the project first.")
    v.raise_if_errors()
    if not partial and budget is None:
        budget = Decimal(0)
    return {"name": name, "description": description, "start_date": start, "end_date": end,
            "budget": budget, "status": status, "user_ids": user_ids}


def _set_members(conn: Connection, milestone_id: int, user_ids: list[int]) -> None:
    """Replace a milestone's member set (removed links are soft-removed)."""
    execute(conn,
            """UPDATE milestone_members SET removed_at = now()
               WHERE milestone_id = %s AND removed_at IS NULL AND NOT (user_id = ANY(%s))""",
            (milestone_id, user_ids))
    for user_id in user_ids:
        execute(conn,
                """INSERT INTO milestone_members (milestone_id, user_id) VALUES (%s, %s)
                   ON CONFLICT (milestone_id, user_id) DO UPDATE SET removed_at = NULL, assigned_at = now()
                   WHERE milestone_members.removed_at IS NOT NULL""",
                (milestone_id, user_id))


def _get(conn: Connection, milestone_id: int) -> dict:
    return _enrich([fetch_one(conn, MILESTONE_SELECT + " WHERE ms.id = %s", (milestone_id,))], conn)[0]


@router.add("GET", "/projects/{id}/milestones")
def list_milestones(ctx: Context) -> tuple[int, list[dict]]:
    """List a project's milestones."""
    project = load_project(ctx.conn, ctx.user, parse_id(ctx.params["id"]))
    return 200, list_project_milestones(ctx.conn, project["id"])


@router.add("POST", "/projects/{id}/milestones")
def create_milestone(ctx: Context) -> tuple[int, dict]:
    """Create a milestone on a project (project manager or admin)."""
    project = load_project(ctx.conn, ctx.user, parse_id(ctx.params["id"]), manage=True)
    if project["archived_at"] is not None:
        raise ConflictError("Archived projects cannot be changed.")
    data = _validate(ctx, Validator(ctx.request.json()), project, None)
    status = data["status"] or "not_started"
    row = fetch_one(
        ctx.conn,
        """INSERT INTO milestones (project_id, name, description, start_date, end_date, budget,
                                   status, completed_at, created_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s, CASE WHEN %s = 'completed' THEN now() END, %s)
           RETURNING id""",
        (project["id"], data["name"], data["description"] or "", data["start_date"], data["end_date"],
         data["budget"], status, status, ctx.user["id"]),
    )
    _set_members(ctx.conn, row["id"], data["user_ids"] or [])
    return 201, _get(ctx.conn, row["id"])


@router.add("GET", "/milestones/{id}")
def get_milestone(ctx: Context) -> tuple[int, dict]:
    """Return one milestone."""
    row, _ = _load_milestone(ctx, manage=False)
    return 200, _enrich([row], ctx.conn)[0]


@router.add("PUT", "/milestones/{id}")
def update_milestone(ctx: Context) -> tuple[int, dict]:
    """Edit a milestone, its members, or mark it complete (project manager or admin)."""
    row, project = _load_milestone(ctx, manage=True)
    if row["archived_at"] is not None:
        raise ConflictError("Archived milestones cannot be edited. Restore it first.")
    data = _validate(ctx, Validator(ctx.request.json(), partial=True), project, row)
    cols = ("name", "description", "start_date", "end_date", "budget", "status")
    sets = [f"{c} = %s" for c in cols if data[c] is not None]
    params: list[Any] = [data[c] for c in cols if data[c] is not None]
    if data["status"] == "completed" and row["status"] != "completed":
        sets.append("completed_at = now()")
    elif data["status"] and data["status"] != "completed":
        sets.append("completed_at = NULL")
    sets.append("updated_at = now()")
    execute(ctx.conn, f"UPDATE milestones SET {', '.join(sets)} WHERE id = %s", [*params, row["id"]])  # nosec B608
    if data["user_ids"] is not None:
        _set_members(ctx.conn, row["id"], data["user_ids"])
    return 200, _get(ctx.conn, row["id"])


@router.add("DELETE", "/milestones/{id}")
def archive_milestone(ctx: Context) -> tuple[int, None]:
    """Archive a milestone (soft delete; admins can restore it)."""
    row, _ = _load_milestone(ctx, manage=True)
    if row["archived_at"] is not None:
        raise ConflictError("Milestone is already archived.")
    execute(ctx.conn, "UPDATE milestones SET archived_at = now(), archived_by = %s WHERE id = %s",
            (ctx.user["id"], row["id"]))
    return 204, None
