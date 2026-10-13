"""Role-aware dashboard summary."""

from datetime import date, timedelta
from typing import Any

from ..db import fetch_all, fetch_one
from ..metrics import business_days, hours_to_days
from ..permissions import is_admin, is_manager
from ..router import Context, router
from .projects import PROJECT_SELECT, enrich_project


def _project_scope(user: dict) -> tuple[str, list[Any]]:
    """SQL predicate on alias ``p`` limiting projects to what the caller can see."""
    if is_admin(user):
        return "p.archived_at IS NULL", []
    if is_manager(user):
        return "p.archived_at IS NULL AND p.manager_id = %s", [user["id"]]
    return ("""p.archived_at IS NULL AND EXISTS (SELECT 1 FROM project_members pm
               WHERE pm.project_id = p.id AND pm.user_id = %s AND pm.removed_at IS NULL)""", [user["id"]])


@router.add("GET", "/dashboard")
def dashboard(ctx: Context) -> tuple[int, dict]:
    """Headline numbers, projects at a glance, upcoming milestones and weekly hours."""
    user = ctx.user
    conn = ctx.conn
    scope, params = _project_scope(user)
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    projects = [enrich_project(r, user) for r in fetch_all(
        conn, PROJECT_SELECT + f" WHERE {scope} ORDER BY p.estimated_end_date", params)]  # scope is fixed SQL  # nosec B608

    # Hours are scoped to the caller: employees only ever see their own time.
    hours_filter = "t.archived_at IS NULL AND " + scope
    hours_params = list(params)
    if not is_admin(user) and not is_manager(user):
        hours_filter += " AND t.user_id = %s"
        hours_params.append(user["id"])

    week_hours = fetch_one(conn,
                           "SELECT COALESCE(sum(t.hours), 0) AS h FROM time_entries t JOIN projects p ON p.id = t.project_id"
                           f" WHERE {hours_filter} AND t.work_date >= %s",  # fixed SQL fragments  # nosec B608
                           [*hours_params, week_start])["h"]
    total_hours = fetch_one(conn,
                            "SELECT COALESCE(sum(t.hours), 0) AS h FROM time_entries t JOIN projects p ON p.id = t.project_id"
                            f" WHERE {hours_filter}",  # fixed SQL fragments  # nosec B608
                            hours_params)["h"]
    weekly = fetch_all(conn,
                       "SELECT date_trunc('week', t.work_date)::date AS week, sum(t.hours) AS hours "
                       "FROM time_entries t JOIN projects p ON p.id = t.project_id "
                       f"WHERE {hours_filter} AND t.work_date >= %s GROUP BY 1 ORDER BY 1",  # nosec B608
                       [*hours_params, week_start - timedelta(weeks=7)])

    upcoming = fetch_all(conn,
                         "SELECT ms.id, ms.name, ms.start_date, ms.end_date, ms.status, p.id AS project_id, "
                         "p.name AS project_name, (ms.end_date < CURRENT_DATE) AS is_overdue "
                         "FROM milestones ms JOIN projects p ON p.id = ms.project_id "
                         f"WHERE ms.archived_at IS NULL AND ms.status <> 'completed' AND {scope} "  # nosec B608
                         "AND ms.end_date <= CURRENT_DATE + 30 ORDER BY ms.end_date LIMIT 10",
                         params)

    stats: dict[str, Any] = {
        "projects_total": len(projects),
        "projects_active": sum(1 for p in projects if p["status"] == "active"),
        "projects_completed": sum(1 for p in projects if p["status"] == "completed"),
        "projects_overdue": sum(1 for p in projects if p["is_overdue"]),
        "milestones_overdue": sum(1 for m in upcoming if m["is_overdue"]),
        "hours_this_week": week_hours,
        "hours_total": total_hours,
        "days_total": hours_to_days(total_hours),
        "budget_total": sum(float(p["budget"]) for p in projects),
    }
    if is_admin(user):
        counts = fetch_one(conn, """SELECT count(*) FILTER (WHERE role = 'employee') AS employees,
                                           count(*) FILTER (WHERE role = 'manager') AS managers
                                    FROM users WHERE archived_at IS NULL""")
        stats.update(counts)
    elif is_manager(user):
        stats["team_size"] = fetch_one(conn, "SELECT count(*) AS n FROM users WHERE manager_id = %s "
                                             "AND archived_at IS NULL", (user["id"],))["n"]
    # Capacity this week for the caller's own time: 8h x weekdays so far.
    stats["capacity_this_week"] = business_days(week_start, today) * 8

    return 200, {
        "stats": stats,
        "projects": projects[:8],
        "upcoming_milestones": upcoming,
        "weekly_hours": weekly,
    }
