"""
HTTP handlers for the reports service.

All read-only, so every handler needs only the "read" permission -- any signed
in role can see the reports; none can change anything through this service.
"""

import logging

import service
from _shared.auth import authenticate, require_permission
from _shared.responses import ok

logger = logging.getLogger()


def summary(event):
    """GET /reports/summary — the dashboard counters."""
    claims = authenticate(event)
    require_permission(claims, "generate_reports")

    row = service.dashboard_summary()
    breakdown = service.project_status_breakdown()

    planned = float(row["total_planned_budget"] or 0)
    consumed = float(row["total_consumed_budget"] or 0)

    return ok(
        {
            "projects": {
                "total": row["total_projects"],
                "active": row["active_projects"],
                "completed": row["completed_projects"],
                "atRisk": row["at_risk_projects"],
                "byStatus": {entry["status"]: entry["count"] for entry in breakdown},
            },
            "deliverables": {
                "total": row["total_deliverables"],
                "overdue": row["overdue_deliverables"],
                "blocked": row["blocked_deliverables"],
            },
            "resources": {
                "total": row["total_resources"],
                "overAllocated": row["over_allocated_resources"],
            },
            "budget": {
                "planned": row["total_planned_budget"],
                "consumed": row["total_consumed_budget"],
                "variance": planned - consumed,
                "consumedRatio": round(consumed / planned, 4) if planned > 0 else None,
            },
        }
    )


def at_risk(event):
    """GET /reports/at-risk — projects in trouble, with the reasons why."""
    claims = authenticate(event)
    require_permission(claims, "generate_reports")

    params = event.get("queryStringParameters") or {}
    limit = params.get("limit")

    rows = service.at_risk_projects(limit=int(limit) if limit and limit.isdigit() else None)

    return ok(
        [
            {
                "id": str(row["id"]),
                "name": row["name"],
                "status": row["status"],
                "endDate": row["end_date"],
                "ownerName": row["owner_name"],
                "daysRemaining": row["days_remaining"],
                "avgCompletion": row["avg_completion"],
                "deliverableCount": row["deliverable_count"],
                "overdueCount": row["overdue_count"],
                "plannedBudget": row["planned_budget"],
                "budgetConsumed": row["budget_consumed"],
                "riskLevel": _risk_level(row),
                "reasons": _risk_reasons(row),
            }
            for row in rows
        ]
    )


def _risk_reasons(row):
    """Explains the flag in terms a project manager can act on."""
    reasons = []

    if row["overdue_count"]:
        count = row["overdue_count"]
        reasons.append(f"{count} overdue deliverable{'s' if count != 1 else ''}")

    if row["budget_consumed"] and row["planned_budget"] is not None:
        if float(row["budget_consumed"]) > float(row["planned_budget"]):
            reasons.append("over planned budget")

    days = row["days_remaining"]
    if days is not None and days < 0:
        reasons.append(f"{abs(days)} days past the end date")
    elif days is not None and days <= 14:
        reasons.append(f"{days} days remaining")

    completion = row["avg_completion"]
    if completion is not None and float(completion) < 80:
        reasons.append(f"only {float(completion):.0f}% complete on average")

    if not row["deliverable_count"]:
        reasons.append("no deliverables recorded")

    return reasons


def _risk_level(row):
    """Buckets a project into High/Medium/Low from how many signals fired."""
    signals = 0

    if row["overdue_count"]:
        signals += 1
    if row["days_remaining"] is not None and row["days_remaining"] < 0:
        signals += 2  # already late outweighs the rest
    if row["budget_consumed"] and row["planned_budget"] is not None:
        if float(row["budget_consumed"]) > float(row["planned_budget"]):
            signals += 1
    if row["avg_completion"] is not None and float(row["avg_completion"]) < 50:
        signals += 1

    if signals >= 3:
        return "High"
    if signals >= 1:
        return "Medium"
    return "Low"


def utilization(event):
    """GET /reports/utilization — per-person load and over-allocation."""
    claims = authenticate(event)
    require_permission(claims, "generate_reports")

    rows = service.utilization()

    return ok(
        [
            {
                "resourceId": str(row["id"]),
                "fullName": row["full_name"],
                "roleTitle": row["role_title"],
                "capacityPct": row["capacity_pct"],
                "allocatedPct": row["allocated_pct"],
                # A 0-1 fraction alongside the raw percent, so the UI can feed a
                # progress bar without re-deriving it.
                "utilization": round(float(row["allocated_pct"]) / 100, 4),
                "projectCount": row["project_count"],
                "isOverAllocated": row["is_over_allocated"],
            }
            for row in rows
        ]
    )


def allocations(event):
    """GET /reports/allocations — the resource/project allocation matrix."""
    claims = authenticate(event)
    require_permission(claims, "generate_reports")

    rows = service.allocation_matrix()

    return ok(
        [
            {
                "resourceId": str(row["resource_id"]),
                "fullName": row["full_name"],
                "roleTitle": row["role_title"],
                "projectId": str(row["project_id"]),
                "projectName": row["project_name"],
                "projectStatus": row["status"],
                "allocationPct": row["allocation_pct"],
                "startDate": row["start_date"],
                "endDate": row["end_date"],
            }
            for row in rows
        ]
    )


def dependencies(event):
    """GET /reports/dependencies — the deliverable graph, plus bottlenecks."""
    claims = authenticate(event)
    require_permission(claims, "generate_reports")

    params = event.get("queryStringParameters") or {}
    nodes, edges = service.dependency_graph(project_id=params.get("projectId"))

    return ok(
        {
            "nodes": [
                {
                    "id": str(node["id"]),
                    "name": node["name"],
                    "status": node["status"],
                    "dueDate": node["due_date"],
                    "completionPercentage": node["completion_percentage"],
                    "projectId": str(node["project_id"]),
                    "projectName": node["project_name"],
                    "isOverdue": node["is_overdue"],
                }
                for node in nodes
            ],
            "edges": [
                {"from": str(edge["deliverable_id"]), "dependsOn": str(edge["depends_on_id"])}
                for edge in edges
            ],
            "bottlenecks": [
                {
                    "id": str(row["id"]),
                    "name": row["name"],
                    "projectName": row["project_name"],
                    "status": row["status"],
                    "dueDate": row["due_date"],
                    "completionPercentage": row["completion_percentage"],
                    "blockingCount": row["blocking_count"],
                    "isOverdue": row["is_overdue"],
                }
                for row in service.bottlenecks()
            ],
        }
    )


def budget(event):
    """GET /reports/budget — consumed vs planned for every project."""
    claims = authenticate(event)
    require_permission(claims, "generate_reports")

    rows = service.budget_report()

    return ok(
        [
            {
                "projectId": str(row["id"]),
                "projectName": row["name"],
                "status": row["status"],
                "plannedBudget": row["planned_budget"],
                "budgetConsumed": row["budget_consumed"],
                "variance": row["variance"],
                "expenseCount": row["expense_count"],
                "isOverspent": row["is_overspent"],
                "consumedRatio": (
                    round(float(row["budget_consumed"]) / float(row["planned_budget"]), 4)
                    if row["planned_budget"] and float(row["planned_budget"]) > 0
                    else None
                ),
            }
            for row in rows
        ]
    )
