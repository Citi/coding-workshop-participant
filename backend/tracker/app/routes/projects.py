"""
Project endpoints.

* Admins create projects and assign exactly one manager to each.
* Managers edit their own projects (details, dates, budget, status) and assign
  employees - including employees from other teams - but cannot create or
  archive projects.
* Only completed projects can be archived, and only by an admin.
"""

from datetime import date
from decimal import Decimal
from typing import Any

from psycopg import Connection

from ..db import execute, fetch_all, fetch_one
from ..errors import ConflictError, ForbiddenError, NotFoundError
from ..metrics import business_days, hours_to_days, percent, planned_hours
from ..permissions import can_manage_project, is_admin, is_manager, load_project, require_roles
from ..router import Context, router
from ..validation import Validator, parse_id, query_int
from .users import ensure_valid_ids

PROJECT_STATUSES = ("planned", "active", "on_hold", "completed")
MAX_BUDGET = Decimal("999999999999")

PROJECT_SELECT = """
    SELECT p.*, m.name AS manager_name,
        (SELECT count(*) FROM project_members pm JOIN users u ON u.id = pm.user_id
          WHERE pm.project_id = p.id AND pm.removed_at IS NULL AND u.archived_at IS NULL) AS member_count,
        COALESCE((SELECT sum(t.hours) FROM time_entries t
          WHERE t.project_id = p.id AND t.archived_at IS NULL), 0) AS total_hours,
        (SELECT count(*) FROM milestones ms WHERE ms.project_id = p.id AND ms.archived_at IS NULL) AS milestone_count,
        (SELECT count(*) FROM milestones ms WHERE ms.project_id = p.id AND ms.archived_at IS NULL
          AND ms.status = 'completed') AS milestones_completed,
        COALESCE((SELECT sum(ms.budget) FROM milestones ms
          WHERE ms.project_id = p.id AND ms.archived_at IS NULL), 0) AS milestone_budget_total
    FROM projects p JOIN users m ON m.id = p.manager_id
"""


def enrich_project(project: dict, user: dict) -> dict:
    """Add derived capacity, progress and permission fields to a project row."""
    total_hours = float(project.get("total_hours") or 0)
    members = int(project.get("member_count") or 0)
    planned = planned_hours(project["start_date"], project["estimated_end_date"], members)
    budget = float(project["budget"])
    allocated = float(project.get("milestone_budget_total") or 0)
    is_open = project["status"] != "completed"
    project.update({
        "working_days": business_days(project["start_date"], project["estimated_end_date"]),
        "planned_hours": planned,
        "total_days": hours_to_days(total_hours),
        "hours_used_pct": percent(total_hours, planned),
        "budget_allocated": allocated,
        "budget_unallocated": round(budget - allocated, 2),
        "is_overdue": is_open and project["estimated_end_date"] < date.today(),
        "can_manage": can_manage_project(user, project),
        "can_archive": is_admin(user) and project["status"] == "completed" and project["archived_at"] is None,
    })
    return project


def get_project_row(conn: Connection, project_id: int) -> dict:
    """Load a project with its aggregate columns or raise 404."""
    row = fetch_one(conn, PROJECT_SELECT + " WHERE p.id = %s", (project_id,))
    if row is None:
        raise NotFoundError("Project not found.")
    return row


def _validate_manager_id(conn: Connection, v: Validator, manager_id: int | None) -> None:
    if manager_id is None:
        return
    row = fetch_one(conn, "SELECT role, archived_at FROM users WHERE id = %s", (manager_id,))
    if row is None or row["role"] != "manager" or row["archived_at"] is not None:
        v.add_error("manager_id", "Select an active manager.")


@router.add("GET", "/projects")
def list_projects(ctx: Context) -> tuple[int, list[dict]]:
    """List active projects visible to the caller with status/search/manager filters."""
    user = ctx.user
    where = ["p.archived_at IS NULL"]
    params: list[Any] = []
    if is_manager(user):
        where.append("p.manager_id = %s")
        params.append(user["id"])
    elif not is_admin(user):
        where.append("""EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id
                        AND pm.user_id = %s AND pm.removed_at IS NULL)""")
        params.append(user["id"])

    query = ctx.request.query
    if query.get("status") in PROJECT_STATUSES:
        where.append("p.status = %s")
        params.append(query["status"])
    manager_id = query_int(query, "manager_id")
    if manager_id:
        where.append("p.manager_id = %s")
        params.append(manager_id)
    search = (query.get("search") or "").strip()
    if search:
        where.append("(p.name ILIKE %s OR p.description ILIKE %s)")
        params.extend([f"%{search}%"] * 2)

    rows = fetch_all(ctx.conn, PROJECT_SELECT + " WHERE " + " AND ".join(where)
                     + " ORDER BY p.estimated_end_date, p.name", params)
    my_hours = {
        r["project_id"]: r["hours"] for r in fetch_all(
            ctx.conn,
            """SELECT project_id, sum(hours) AS hours FROM time_entries
               WHERE user_id = %s AND archived_at IS NULL GROUP BY project_id""",
            (user["id"],),
        )
    }
    result = []
    for row in rows:
        enriched = enrich_project(row, user)
        enriched["my_hours"] = my_hours.get(row["id"], 0)
        result.append(enriched)
    return 200, result


@router.add("POST", "/projects")
def create_project(ctx: Context) -> tuple[int, dict]:
    """Admin-only: create a project and assign its manager."""
    require_roles(ctx.user, "admin")
    v = Validator(ctx.request.json())
    name = v.string("name", required=True, max_len=150)
    description = v.string("description", max_len=5000) or ""
    manager_id = v.integer("manager_id", required=True)
    start = v.date("start_date", required=True)
    end = v.date("estimated_end_date", required=True)
    budget = v.decimal("budget", min_value=Decimal(0), max_value=MAX_BUDGET) or Decimal(0)
    status = v.choice("status", ("planned", "active", "on_hold")) or "planned"
    if start and end and end < start:
        v.add_error("estimated_end_date", "Estimated end date must be on or after the start date.")
    _validate_manager_id(ctx.conn, v, manager_id)
    v.raise_if_errors()

    row = fetch_one(
        ctx.conn,
        """INSERT INTO projects (name, description, manager_id, start_date, estimated_end_date,
                                 budget, status, created_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (name, description, manager_id, start, end, budget, status, ctx.user["id"]),
    )
    return 201, enrich_project(get_project_row(ctx.conn, row["id"]), ctx.user)


@router.add("GET", "/projects/{id}")
def get_project(ctx: Context) -> tuple[int, dict]:
    """Project detail with members, per-person hours and milestones."""
    project_id = parse_id(ctx.params["id"])
    load_project(ctx.conn, ctx.user, project_id)
    project = enrich_project(get_project_row(ctx.conn, project_id), ctx.user)
    project["members"] = project_members(ctx.conn, project)
    from .milestones import list_project_milestones  # local import avoids a cycle
    project["milestones"] = list_project_milestones(ctx.conn, project_id)
    project["can_log_time"] = project["archived_at"] is None and (
        project["can_manage"] or any(m["id"] == ctx.user["id"] for m in project["members"])
    )
    return 200, project


def project_members(conn: Connection, project: dict) -> list[dict]:
    """Active members of a project with hours logged and planned capacity."""
    rows = fetch_all(
        conn,
        """SELECT u.id, u.name, u.email, u.username, u.job_title, u.manager_id, mgr.name AS manager_name,
                  pm.assigned_at,
                  COALESCE((SELECT sum(t.hours) FROM time_entries t WHERE t.project_id = %s
                            AND t.user_id = u.id AND t.archived_at IS NULL), 0) AS hours
           FROM project_members pm
           JOIN users u ON u.id = pm.user_id
           LEFT JOIN users mgr ON mgr.id = u.manager_id
           WHERE pm.project_id = %s AND pm.removed_at IS NULL AND u.archived_at IS NULL
           ORDER BY u.name""",
        (project["id"], project["id"]),
    )
    capacity = planned_hours(project["start_date"], project["estimated_end_date"], 1)
    for row in rows:
        row["days"] = hours_to_days(row["hours"])
        row["planned_hours"] = capacity
        row["on_manager_team"] = row["manager_id"] == project["manager_id"]
    return rows


@router.add("PUT", "/projects/{id}")
def update_project(ctx: Context) -> tuple[int, dict]:
    """Edit a project. Managers cannot reassign the project's manager."""
    project_id = parse_id(ctx.params["id"])
    project = load_project(ctx.conn, ctx.user, project_id, manage=True)
    if project["archived_at"] is not None:
        raise ConflictError("Archived projects cannot be edited. Restore it first.")
    body = ctx.request.json()
    if "manager_id" in body and not is_admin(ctx.user) and body["manager_id"] != project["manager_id"]:
        raise ForbiddenError("Only an admin can change a project's manager.")

    v = Validator(body, partial=True)
    name = v.string("name", required=True, max_len=150)
    description = v.string("description", max_len=5000)
    manager_id = v.integer("manager_id", required=True) if is_admin(ctx.user) else None
    start = v.date("start_date", required=True) or project["start_date"]
    end = v.date("estimated_end_date", required=True) or project["estimated_end_date"]
    budget = v.decimal("budget", required=True, min_value=Decimal(0), max_value=MAX_BUDGET)
    status = v.choice("status", PROJECT_STATUSES, required=True)
    if end < start:
        v.add_error("estimated_end_date", "Estimated end date must be on or after the start date.")
    _validate_manager_id(ctx.conn, v, manager_id)

    agg = fetch_one(ctx.conn,
                    """SELECT COALESCE(sum(budget), 0) AS allocated, min(start_date) AS first_start,
                              count(*) FILTER (WHERE status <> 'completed') AS open_count
                       FROM milestones WHERE project_id = %s AND archived_at IS NULL""",
                    (project_id,))
    if budget is not None and budget < agg["allocated"]:
        v.add_error("budget", f"Budget cannot be below the {agg['allocated']:,.2f} already allocated to milestones.")
    if agg["first_start"] and start > agg["first_start"]:
        v.add_error("start_date", "A milestone starts before this date; adjust milestones first.")
    if status == "completed" and project["status"] != "completed" and agg["open_count"]:
        v.add_error("status", f"Complete the remaining {agg['open_count']} milestone(s) first.")
    v.raise_if_errors()

    updates: dict[str, Any] = {
        "name": name, "description": description, "manager_id": manager_id,
        "start_date": v.data.get("start_date") and start, "estimated_end_date": v.data.get("estimated_end_date") and end,
        "budget": budget, "status": status,
    }
    sets = [f"{col} = %s" for col, val in updates.items() if val is not None]
    params = [val for val in updates.values() if val is not None]
    if status == "completed" and project["status"] != "completed":
        sets.append("completed_at = now()")
    elif status and status != "completed":
        sets.append("completed_at = NULL")
    sets.append("updated_at = now()")
    execute(ctx.conn, f"UPDATE projects SET {', '.join(sets)} WHERE id = %s", [*params, project_id])  # nosec B608
    return 200, enrich_project(get_project_row(ctx.conn, project_id), ctx.user)


@router.add("DELETE", "/projects/{id}")
def archive_project(ctx: Context) -> tuple[int, None]:
    """Admin-only: archive a completed project (soft delete)."""
    require_roles(ctx.user, "admin")
    project = load_project(ctx.conn, ctx.user, parse_id(ctx.params["id"]))
    if project["archived_at"] is not None:
        raise ConflictError("Project is already archived.")
    if project["status"] != "completed":
        raise ConflictError("Only completed projects can be archived. Ask the manager to mark it complete first.")
    execute(ctx.conn, "UPDATE projects SET archived_at = now(), archived_by = %s WHERE id = %s",
            (ctx.user["id"], project["id"]))
    return 204, None


@router.add("GET", "/projects/{id}/members")
def list_members(ctx: Context) -> tuple[int, list[dict]]:
    """List the people assigned to a project."""
    project = load_project(ctx.conn, ctx.user, parse_id(ctx.params["id"]))
    return 200, project_members(ctx.conn, project)


@router.add("POST", "/projects/{id}/members")
def add_members(ctx: Context) -> tuple[int, list[dict]]:
    """Assign one or more employees (e.g. a whole team) to a project."""
    project = load_project(ctx.conn, ctx.user, parse_id(ctx.params["id"]), manage=True)
    if project["archived_at"] is not None:
        raise ConflictError("Archived projects cannot be changed.")
    body = ctx.request.json()
    v = Validator(body)
    user_ids = v.int_list("user_ids") or []
    single = v.integer("user_id")
    if single:
        user_ids.append(single)
    if not user_ids and not v.errors:
        v.add_error("user_ids", "Select at least one employee.")
    v.raise_if_errors()
    ensure_valid_ids(ctx.conn, user_ids)
    for user_id in dict.fromkeys(user_ids):
        execute(
            ctx.conn,
            """INSERT INTO project_members (project_id, user_id, assigned_by) VALUES (%s, %s, %s)
               ON CONFLICT (project_id, user_id)
               DO UPDATE SET removed_at = NULL, assigned_by = EXCLUDED.assigned_by, assigned_at = now()
               WHERE project_members.removed_at IS NOT NULL""",
            (project["id"], user_id, ctx.user["id"]),
        )
    return 201, project_members(ctx.conn, project)


@router.add("DELETE", "/projects/{id}/members/{user_id}")
def remove_member(ctx: Context) -> tuple[int, None]:
    """Unassign an employee. Their logged time is kept for reporting."""
    project = load_project(ctx.conn, ctx.user, parse_id(ctx.params["id"]), manage=True)
    user_id = parse_id(ctx.params["user_id"], "user_id")
    count = execute(ctx.conn,
                    """UPDATE project_members SET removed_at = now()
                       WHERE project_id = %s AND user_id = %s AND removed_at IS NULL""",
                    (project["id"], user_id))
    if not count:
        raise NotFoundError("That person is not assigned to this project.")
    execute(ctx.conn,
            """UPDATE milestone_members SET removed_at = now()
               WHERE user_id = %s AND removed_at IS NULL
                 AND milestone_id IN (SELECT id FROM milestones WHERE project_id = %s)""",
            (user_id, project["id"]))
    return 204, None
