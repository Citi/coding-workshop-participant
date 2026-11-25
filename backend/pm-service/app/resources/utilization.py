"""Resource utilization rule shared by resources, allocations and the dashboard.

A person is over-allocated when their allocation % across ACTIVE projects adds up to
more than OVER_ALLOCATION_THRESHOLD. Allocations to planned/on-hold/closed projects are
kept (they show who is lined up) but do not count towards current utilization.
"""

OVER_ALLOCATION_THRESHOLD = 100

_UTILIZATION_SQL = """
SELECT r.id AS resource_id,
       COALESCE(SUM(a.allocation_percent) FILTER (WHERE p.status = 'active'), 0)::int AS total_allocation_percent,
       COUNT(a.id) FILTER (WHERE p.status = 'active') AS active_project_count
FROM resources r
LEFT JOIN allocations a ON a.resource_id = r.id
LEFT JOIN projects p ON p.id = a.project_id
WHERE (%(ids)s::int[] IS NULL OR r.id = ANY(%(ids)s::int[]))
GROUP BY r.id
"""


def is_over_allocated(total_allocation_percent: int) -> bool:
    return total_allocation_percent > OVER_ALLOCATION_THRESHOLD


def fetch_resource_utilization(conn, resource_ids=None) -> dict:
    """Return ``{resource_id: {"total_allocation_percent", "active_project_count"}}``."""
    ids = list(resource_ids) if resource_ids is not None else None
    if ids is not None and not ids:
        return {}
    rows = conn.execute(_UTILIZATION_SQL, {"ids": ids}).fetchall()
    return {row["resource_id"]: row for row in rows}


def enrich_resource(resource: dict, utilization: dict | None) -> dict:
    total = (utilization or {}).get("total_allocation_percent", 0)
    return {
        **resource,
        "total_allocation_percent": total,
        "active_project_count": (utilization or {}).get("active_project_count", 0),
        "is_over_allocated": is_over_allocated(total),
    }
