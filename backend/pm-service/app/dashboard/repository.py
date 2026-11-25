"""SQL for the dashboard's lists (always parameterized). The per-project and per-person
numbers come from the shared read models in ``app.projects.metrics`` and ``app.resources.utilization``."""

# Not-completed deliverables in the DeliverableSummary shape; a NULL filter means "no filter".
_OPEN_DELIVERABLES_SQL = """
SELECT d.id, d.name, d.project_id, p.name AS project_name, d.status, d.due_date, d.is_key,
       r.full_name AS owner_name
FROM deliverables d
JOIN projects p ON p.id = d.project_id
LEFT JOIN resources r ON r.id = d.owner_id
WHERE d.status <> 'completed'
  AND (%(is_key)s::boolean IS NULL OR d.is_key = %(is_key)s)
  AND (%(due_from)s::date IS NULL OR d.due_date >= %(due_from)s)
  AND (%(due_to)s::date IS NULL OR d.due_date <= %(due_to)s)
ORDER BY d.due_date, d.id
LIMIT %(limit)s
"""

# Each person's allocations to ACTIVE projects: the ones their utilization is made of.
_ACTIVE_ALLOCATIONS_SQL = """
SELECT a.resource_id,
       json_agg(json_build_object('project_id', p.id, 'project_name', p.name,
                                  'allocation_percent', a.allocation_percent)
                ORDER BY lower(p.name), p.id) AS allocations
FROM allocations a
JOIN projects p ON p.id = a.project_id
WHERE p.status = 'active' AND a.resource_id = ANY(%(ids)s::int[])
GROUP BY a.resource_id
"""


def list_open_deliverables(conn, *, limit: int, is_key=None, due_from=None, due_to=None) -> list[dict]:
    """Up to ``limit`` not-completed deliverables, earliest due date first (``due_from``/``due_to`` inclusive)."""
    params = {"is_key": is_key, "due_from": due_from, "due_to": due_to, "limit": limit}
    return conn.execute(_OPEN_DELIVERABLES_SQL, params).fetchall()


def active_allocations_by_resource(conn, resource_ids) -> dict:
    """``{resource_id: [{project_id, project_name, allocation_percent}]}``, sorted by project name."""
    ids = list(resource_ids)
    if not ids:
        return {}
    rows = conn.execute(_ACTIVE_ALLOCATIONS_SQL, {"ids": ids}).fetchall()
    return {row["resource_id"]: row["allocations"] for row in rows}
