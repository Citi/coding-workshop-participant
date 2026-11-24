"""GET /dashboard: one read-only snapshot of the whole portfolio.

Every section is evaluated against the same "today" and built from the shared read models
(project metrics and health, resource utilization), so its numbers match the other endpoints.
"""

from datetime import timedelta

from app.core import clock
from app.dashboard import repository, rules
from app.deliverables.rules import is_overdue
from app.projects import repository as projects_repository
from app.projects.health import HEALTH_VALUES
from app.projects.metrics import enrich_project, fetch_project_metrics
from app.projects.schemas import PROJECT_STATUSES
from app.resources import repository as resources_repository
from app.resources.utilization import enrich_resource, fetch_resource_utilization


def build_dashboard(conn) -> dict:
    """The dashboard response, section by section in the documented order."""
    today = clock.today()
    projects = _projects_with_metrics(conn, today)
    resources = _resources_with_utilization(conn)
    over_allocated = _over_allocated_resources(conn, resources)
    budget_lines = rules.budget_lines(projects)
    return {
        "generated_at": clock.now().isoformat(timespec="seconds"),
        "projects": {
            "total": len(projects),
            "by_status": rules.count_by(projects, "status", PROJECT_STATUSES),
            "by_health": rules.count_by(projects, "health", HEALTH_VALUES),
        },
        "active_projects": rules.active_projects(projects),
        "at_risk_projects": rules.at_risk_projects(projects),
        "deliverables": rules.deliverable_totals(projects),
        **_deliverable_lists(conn, today),
        "resources": {"total": len(resources), "over_allocated": len(over_allocated)},
        "over_allocated_resources": over_allocated,
        "budget": rules.budget_totals(budget_lines),
        "budget_by_project": budget_lines,
    }


def _projects_with_metrics(conn, today) -> list[dict]:
    """Every project with its computed fields (ONE metrics query for all of them)."""
    projects = projects_repository.list_projects(conn)
    metrics = fetch_project_metrics(conn, [project["id"] for project in projects], today=today)
    return [enrich_project(project, metrics.get(project["id"]), today=today) for project in projects]


def _resources_with_utilization(conn) -> list[dict]:
    """Every resource with its utilization (ONE utilization query for all of them)."""
    resources = resources_repository.list_resources(conn)
    utilization = fetch_resource_utilization(conn, [resource["id"] for resource in resources])
    return [enrich_resource(resource, utilization.get(resource["id"])) for resource in resources]


def _over_allocated_resources(conn, resources) -> list[dict]:
    """Over-allocated people with the active-project allocations behind their total."""
    flagged = rules.over_allocated(resources)
    allocations = repository.active_allocations_by_resource(conn, [resource["id"] for resource in flagged])
    return [
        {**rules.pick(resource, rules.OVER_ALLOCATED_FIELDS), "allocations": allocations.get(resource["id"], [])}
        for resource in flagged
    ]


def _deliverable_lists(conn, today) -> dict:
    """The three lists of open deliverables (max ``LIST_LIMIT`` each, earliest due date first)."""
    upcoming_until = today + timedelta(days=rules.UPCOMING_WINDOW_DAYS)
    return {
        "key_deliverables": _summaries(conn, today, is_key=True),
        "upcoming_deliverables": _summaries(conn, today, due_from=today, due_to=upcoming_until),
        "overdue_deliverables": _summaries(conn, today, due_to=today - timedelta(days=1)),  # due before today
    }


def _summaries(conn, today, **filters) -> list[dict]:
    """DeliverableSummary rows plus the computed ``is_overdue`` flag."""
    rows = repository.list_open_deliverables(conn, limit=rules.LIST_LIMIT, **filters)
    return [{**row, "is_overdue": is_overdue(row["status"], row["due_date"], today)} for row in rows]
