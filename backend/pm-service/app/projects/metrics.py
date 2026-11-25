"""Read model shared by the projects and dashboard domains: per-project aggregates
(deliverable counts, spend, team size) and the computed fields from ``health.py``."""

from app.projects.health import budget_summary, evaluate_health, progress_percent

_METRICS_SQL = """
SELECT p.id AS project_id,
       d.total, d.completed, d.overdue, d.blocked, d.key_total, d.key_completed,
       COALESCE(e.spent, 0) AS spent,
       COALESCE(a.team_size, 0) AS team_size
FROM projects p
CROSS JOIN LATERAL (
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed,
           COUNT(*) FILTER (WHERE status <> 'completed' AND due_date < %(today)s) AS overdue,
           COUNT(*) FILTER (WHERE status = 'blocked') AS blocked,
           COUNT(*) FILTER (WHERE is_key) AS key_total,
           COUNT(*) FILTER (WHERE is_key AND status = 'completed') AS key_completed
    FROM deliverables WHERE project_id = p.id
) d
LEFT JOIN LATERAL (SELECT SUM(amount) AS spent FROM expenses WHERE project_id = p.id) e ON TRUE
LEFT JOIN LATERAL (SELECT COUNT(*) AS team_size FROM allocations WHERE project_id = p.id) a ON TRUE
WHERE (%(ids)s::int[] IS NULL OR p.id = ANY(%(ids)s::int[]))
"""

_EMPTY = {
    "total": 0,
    "completed": 0,
    "overdue": 0,
    "blocked": 0,
    "key_total": 0,
    "key_completed": 0,
    "spent": 0,
    "team_size": 0,
}


def fetch_project_metrics(conn, project_ids=None, *, today) -> dict:
    """Return ``{project_id: metrics}`` for the given projects (all projects when ``None``)."""
    ids = list(project_ids) if project_ids is not None else None
    if ids is not None and not ids:
        return {}
    rows = conn.execute(_METRICS_SQL, {"today": today, "ids": ids}).fetchall()
    return {row["project_id"]: row for row in rows}


def enrich_project(project: dict, metrics: dict | None, *, today) -> dict:
    """Add computed fields (progress, health, budget, team size) to a projects row."""
    m = metrics or _EMPTY
    health, reasons = evaluate_health(
        status=project["status"],
        start_date=project["start_date"],
        end_date=project["end_date"],
        total=m["total"],
        completed=m["completed"],
        overdue=m["overdue"],
        blocked=m["blocked"],
        today=today,
    )
    return {
        **project,
        "progress_percent": progress_percent(m["total"], m["completed"]),
        "deliverables_total": m["total"],
        "deliverables_completed": m["completed"],
        "deliverables_overdue": m["overdue"],
        "deliverables_blocked": m["blocked"],
        "key_deliverables_total": m["key_total"],
        "key_deliverables_completed": m["key_completed"],
        "team_size": m["team_size"],
        "health": health,
        "health_reasons": reasons,
        **budget_summary(project["budget"], m["spent"]),
    }
