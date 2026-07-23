"""
Read-only aggregate queries.

This service owns no tables. It exists so the seven business questions are
answered by the database in one round trip each, rather than by a client
fetching whole collections and reducing them -- which would neither scale nor
give two clients the same answer.

Serialisation lives in routes.py; with no writes there is nothing to validate,
which is why this service has no models.py.
"""

from _shared import db


def dashboard_summary():
    """The headline counters, each as its own scalar subquery.

    Separate subqueries rather than joins: counting projects and deliverables
    in one joined statement would multiply the project rows by their children
    and inflate every total.
    """
    return db.query(
        """
        SELECT
            (SELECT COUNT(*) FROM projects)                                    AS total_projects,
            (SELECT COUNT(*) FROM projects WHERE status = 'active')            AS active_projects,
            (SELECT COUNT(*) FROM projects WHERE status = 'completed')         AS completed_projects,
            (SELECT COUNT(*) FROM v_project_health WHERE at_risk)              AS at_risk_projects,
            (SELECT COUNT(*) FROM deliverables)                                AS total_deliverables,
            (SELECT COUNT(*) FROM deliverables
              WHERE due_date < CURRENT_DATE
                AND status NOT IN ('completed','cancelled'))                   AS overdue_deliverables,
            (SELECT COUNT(*) FROM deliverables WHERE status = 'blocked')       AS blocked_deliverables,
            (SELECT COUNT(*) FROM resources)                                   AS total_resources,
            (SELECT COUNT(*) FROM v_resource_utilization
              WHERE is_over_allocated)                                         AS over_allocated_resources,
            (SELECT COALESCE(SUM(planned_budget), 0) FROM projects)            AS total_planned_budget,
            (SELECT COALESCE(SUM(amount), 0) FROM expenses)                    AS total_consumed_budget
        """,
        one=True,
    )


def at_risk_projects(limit=None):
    """Q: "Which projects are at risk of missing their deadlines?"

    The view decides at_risk; this adds the *reasons*, so the UI can explain
    the flag instead of just showing it.
    """
    sql = """
        SELECT h.id, h.name, h.status, h.end_date, h.planned_budget,
               h.budget_consumed, h.avg_completion, h.at_risk,
               h.overdue_count, h.deliverable_count,
               (h.end_date - CURRENT_DATE) AS days_remaining,
               u.full_name AS owner_name
        FROM v_project_health h
        JOIN projects p  ON p.id = h.id
        LEFT JOIN users u ON u.id = p.owner_id
        WHERE h.at_risk
           OR h.overdue_count > 0
           OR h.budget_consumed > h.planned_budget
        ORDER BY h.end_date ASC NULLS LAST
    """
    params = []

    if limit:
        sql += " LIMIT %s"
        params.append(limit)

    return db.query(sql, params)


def utilization():
    """Q: "Which team members are over-allocated across multiple projects?" """
    return db.query(
        """
        SELECT v.id, v.full_name, v.role_title, v.capacity_pct,
               v.allocated_pct, v.project_count, v.is_over_allocated
        FROM v_resource_utilization v
        ORDER BY v.allocated_pct DESC, v.full_name ASC
        """
    )


def allocation_matrix():
    """Q: "How are resources allocated across projects?"

    One row per active resource/project pairing, which is what a heat-map or
    cross-tab needs.
    """
    return db.query(
        """
        SELECT r.id AS resource_id, r.full_name, r.role_title,
               p.id AS project_id, p.name AS project_name, p.status,
               a.allocation_pct, a.start_date, a.end_date
        FROM allocations a
        JOIN resources r ON r.id = a.resource_id
        JOIN projects  p ON p.id = a.project_id
        WHERE a.start_date <= CURRENT_DATE
          AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
        ORDER BY r.full_name, a.allocation_pct DESC
        """
    )


def dependency_graph(project_id=None):
    """Q: "What is the dependency chain between deliverables?"

    Returns the full node/edge set rather than one traversal, so the client can
    render whichever chains it needs.
    """
    node_sql = """
        SELECT d.id, d.name, d.status, d.due_date, d.completion_percentage,
               d.project_id, p.name AS project_name,
               (d.due_date < CURRENT_DATE
                AND d.status NOT IN ('completed','cancelled')) AS is_overdue
        FROM deliverables d
        JOIN projects p ON p.id = d.project_id
    """
    edge_sql = """
        SELECT dd.deliverable_id, dd.depends_on_id
        FROM deliverable_dependencies dd
        JOIN deliverables d ON d.id = dd.deliverable_id
    """
    params = []

    if project_id:
        node_sql += " WHERE d.project_id = %s"
        edge_sql += " WHERE d.project_id = %s"
        params.append(project_id)

    node_sql += " ORDER BY d.due_date ASC NULLS LAST, d.name"

    return db.query(node_sql, params), db.query(edge_sql, params)


def bottlenecks():
    """Incomplete deliverables that other work is waiting on.

    `blocking_count` is how many deliverables depend on this one, so the top of
    the list is where unblocking effort pays off most.
    """
    return db.query(
        """
        SELECT d.id, d.name, d.status, d.due_date, d.completion_percentage,
               p.name AS project_name,
               COUNT(dd.deliverable_id) AS blocking_count,
               (d.due_date < CURRENT_DATE
                AND d.status NOT IN ('completed','cancelled')) AS is_overdue
        FROM deliverables d
        JOIN projects p ON p.id = d.project_id
        JOIN deliverable_dependencies dd ON dd.depends_on_id = d.id
        WHERE d.status NOT IN ('completed','cancelled')
        GROUP BY d.id, d.name, d.status, d.due_date,
                 d.completion_percentage, p.name
        ORDER BY blocking_count DESC, d.due_date ASC NULLS LAST
        """
    )


def budget_report():
    """Q: "How much budget has been consumed versus planned for each project?" """
    return db.query(
        """
        SELECT p.id, p.name, p.status, p.planned_budget,
               COALESCE(e.consumed, 0)    AS budget_consumed,
               COALESCE(e.line_count, 0)  AS expense_count,
               (p.planned_budget - COALESCE(e.consumed, 0)) AS variance,
               (COALESCE(e.consumed, 0) > p.planned_budget) AS is_overspent
        FROM projects p
        LEFT JOIN (
            SELECT project_id, SUM(amount) AS consumed, COUNT(*) AS line_count
            FROM expenses GROUP BY project_id
        ) e ON e.project_id = p.id
        ORDER BY (COALESCE(e.consumed, 0) - p.planned_budget) DESC, p.name
        """
    )


def project_status_breakdown():
    """Q: "What is the current status of each active project?" (rolled up)"""
    return db.query(
        """
        SELECT status, COUNT(*) AS count
        FROM projects
        GROUP BY status
        ORDER BY count DESC
        """
    )
