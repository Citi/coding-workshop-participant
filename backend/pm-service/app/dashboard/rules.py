"""Pure dashboard rules (no database): which projects, people and budget lines the overview
shows, in which order, and the portfolio totals.

The per-project and per-person computed fields come from the shared read models
(``app.projects.metrics`` and ``app.resources.utilization``), so the dashboard always shows
the same numbers as the projects and resources endpoints.
"""

from decimal import Decimal

from app.projects.health import budget_summary

LIST_LIMIT = 10  # deliverables shown per dashboard list
UPCOMING_WINDOW_DAYS = 14  # "upcoming" = due from today to today + 14 days, both included
AT_RISK_ORDER = ("overdue", "at_risk")  # health values listed in at_risk_projects, most urgent first
EXCLUDED_FROM_BUDGET = frozenset({"cancelled"})

PROJECT_SUMMARY_FIELDS = (
    "id",
    "name",
    "department",
    "status",
    "start_date",
    "end_date",
    "progress_percent",
    "health",
    "health_reasons",
    "budget",
    "budget_spent",
    "budget_used_percent",
    "over_budget",
    "team_size",
)
BUDGET_FIELDS = ("budget", "budget_spent", "budget_remaining", "budget_used_percent", "over_budget")
OVER_ALLOCATED_FIELDS = ("id", "full_name", "job_title", "department", "total_allocation_percent")

# dashboard deliverable counter -> the enriched-project counter it adds up
DELIVERABLE_COUNTERS = {
    "total": "deliverables_total",
    "completed": "deliverables_completed",
    "overdue": "deliverables_overdue",
    "blocked": "deliverables_blocked",
    "key_total": "key_deliverables_total",
    "key_completed": "key_deliverables_completed",
}


def pick(row: dict, fields) -> dict:
    """The given fields of a row, in that order."""
    return {field: row[field] for field in fields}


def count_by(items, key: str, values) -> dict:
    """``{value: count}`` for every allowed value (0 when absent); other values, such as None, are not counted."""
    counts = dict.fromkeys(values, 0)
    for item in items:
        if item[key] in counts:
            counts[item[key]] += 1
    return counts


def _by_end_date(project: dict) -> tuple:
    """Sort key: earliest end date first, then name."""
    return project["end_date"], project["name"].lower(), project["id"]


def active_projects(projects) -> list[dict]:
    """ProjectSummary of every active project, earliest end date first."""
    active = sorted((project for project in projects if project["status"] == "active"), key=_by_end_date)
    return [pick(project, PROJECT_SUMMARY_FIELDS) for project in active]


def at_risk_projects(projects) -> list[dict]:
    """ProjectSummary of every overdue or at-risk project: overdue first, then by end date."""
    flagged = sorted(
        (project for project in projects if project["health"] in AT_RISK_ORDER),
        key=lambda project: (AT_RISK_ORDER.index(project["health"]), *_by_end_date(project)),
    )
    return [pick(project, PROJECT_SUMMARY_FIELDS) for project in flagged]


def deliverable_totals(projects) -> dict:
    """Portfolio deliverable counters: the per-project counters added up."""
    return {counter: sum(project[field] for project in projects) for counter, field in DELIVERABLE_COUNTERS.items()}


def budget_lines(projects) -> list[dict]:
    """One budget line per project except cancelled ones: highest used % first, unknown % (None) on top."""
    lines = [
        {
            "project_id": project["id"],
            "project_name": project["name"],
            "status": project["status"],
            **pick(project, BUDGET_FIELDS),
        }
        for project in projects
        if project["status"] not in EXCLUDED_FROM_BUDGET
    ]
    return sorted(lines, key=_budget_line_order)


def _budget_line_order(line: dict) -> tuple:
    """Sort key: None first (spending against a zero budget), then used % descending, then name."""
    used = line["budget_used_percent"]
    return used is not None, -(used or 0), line["project_name"].lower(), line["project_id"]


def budget_totals(lines) -> dict:
    """Planned vs spent across the budget lines; used % is 0 when nothing is planned."""
    planned = sum((line["budget"] for line in lines), Decimal(0))
    spent = sum((line["budget_spent"] for line in lines), Decimal(0))
    return {
        "total_planned": planned,
        "total_spent": spent,
        # the same rounding as a project's budget_used_percent
        "used_percent": budget_summary(planned, spent)["budget_used_percent"] if planned > 0 else 0.0,
        "over_budget_projects": sum(1 for line in lines if line["over_budget"]),
    }


def over_allocated(resources) -> list[dict]:
    """People over the allocation threshold, highest total first, then by name."""
    return sorted(
        (resource for resource in resources if resource["is_over_allocated"]),
        key=lambda resource: (-resource["total_allocation_percent"], resource["full_name"].lower(), resource["id"]),
    )
