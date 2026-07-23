"""
Database operations for deliverables and their dependency graph.

The dependency work is the interesting part here: `deliverable_dependencies` is
a self-referencing many-to-many, and the schema's CHECK only stops A->A. Longer
cycles (A->B->C->A) have to be prevented in application logic, which is what
`would_create_cycle` does before any insert.
"""

from _shared import db

_SELECT = """
    SELECT d.id, d.project_id, d.name, d.description, d.status,
           d.completion_percentage, d.due_date, d.assignee_id,
           d.created_at, d.updated_at,
           p.name AS project_name,
           r.full_name AS assignee_name,
           (d.due_date < CURRENT_DATE
            AND d.status NOT IN ('completed','cancelled')) AS is_overdue,
           COALESCE(
               (SELECT array_agg(dd.depends_on_id)
                FROM deliverable_dependencies dd
                WHERE dd.deliverable_id = d.id),
               ARRAY[]::uuid[]
           ) AS depends_on
    FROM deliverables d
    JOIN projects p        ON p.id = d.project_id
    LEFT JOIN resources r  ON r.id = d.assignee_id
"""


def list_deliverables(project_id=None, status=None, assignee_id=None,
                      due_before=None, overdue_only=None, search=None):
    """Filtered deliverable list."""
    sql = _SELECT
    conditions = []
    params = []

    if project_id:
        conditions.append("d.project_id = %s")
        params.append(project_id)

    if status:
        conditions.append("d.status = %s")
        params.append(status)

    if assignee_id:
        conditions.append("d.assignee_id = %s")
        params.append(assignee_id)

    if due_before:
        conditions.append("d.due_date <= %s")
        params.append(due_before)

    if overdue_only:
        conditions.append("d.due_date < CURRENT_DATE AND d.status NOT IN ('completed','cancelled')")

    if search:
        conditions.append("(d.name ILIKE %s OR d.description ILIKE %s)")
        like = f"%{search}%"
        params.extend([like, like])

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    # Soonest due first; undated items last, since a missing date is not urgent.
    sql += " ORDER BY d.due_date ASC NULLS LAST, d.name ASC"
    return db.query(sql, params)


def get_deliverable(deliverable_id):
    return db.query(f"{_SELECT} WHERE d.id = %s", (deliverable_id,), one=True)


def create_deliverable(data):
    inserted = db.execute(
        """
        INSERT INTO deliverables
            (project_id, name, description, status, completion_percentage,
             due_date, assignee_id)
        VALUES (%s, %s, %s, COALESCE(%s, 'not_started'), COALESCE(%s, 0), %s, %s)
        RETURNING id
        """,
        (
            data.get("projectId"),
            data.get("name"),
            data.get("description"),
            data.get("status"),
            data.get("completionPercentage"),
            data.get("dueDate"),
            data.get("assigneeId"),
        ),
        one=True,
    )
    return get_deliverable(inserted["id"])


_UPDATABLE = {
    "name": "name",
    "description": "description",
    "status": "status",
    "completionPercentage": "completion_percentage",
    "dueDate": "due_date",
    "assigneeId": "assignee_id",
}


def update_deliverable(deliverable_id, data):
    sets = []
    params = []

    for field, column in _UPDATABLE.items():
        if field in data:
            sets.append(f"{column} = %s")
            params.append(data[field])

    if not sets:
        return get_deliverable(deliverable_id)

    params.append(deliverable_id)
    updated = db.execute(
        f"UPDATE deliverables SET {', '.join(sets)} WHERE id = %s RETURNING id",
        params,
        one=True,
    )
    return get_deliverable(updated["id"]) if updated else None


def delete_deliverable(deliverable_id):
    """Deletes a deliverable; its dependency edges cascade away with it."""
    return db.execute(
        "DELETE FROM deliverables WHERE id = %s RETURNING id", (deliverable_id,), one=True
    )


def project_exists(project_id):
    row = db.query("SELECT 1 AS ok FROM projects WHERE id = %s", (project_id,), one=True)
    return row is not None


def resource_exists(resource_id):
    row = db.query("SELECT 1 AS ok FROM resources WHERE id = %s", (resource_id,), one=True)
    return row is not None


# -- Dependencies -----------------------------------------------------------


def would_create_cycle(deliverable_id, depends_on_id):
    """True if adding this edge would close a loop.

    An edge means "deliverable_id depends on depends_on_id". A cycle exists if
    depends_on_id already depends -- directly or transitively -- on
    deliverable_id, because the new edge would complete the circle.

    The walk carries the visited path in an array and refuses to revisit a
    node. Without that, a cycle already present in the data would make this
    query itself run forever.
    """
    row = db.query(
        """
        WITH RECURSIVE reachable AS (
            SELECT dd.depends_on_id AS node, ARRAY[dd.deliverable_id] AS path
            FROM deliverable_dependencies dd
            WHERE dd.deliverable_id = %s
          UNION ALL
            SELECT dd.depends_on_id, r.path || dd.deliverable_id
            FROM deliverable_dependencies dd
            JOIN reachable r ON dd.deliverable_id = r.node
            WHERE NOT dd.depends_on_id = ANY(r.path)
        )
        SELECT 1 AS found FROM reachable WHERE node = %s LIMIT 1
        """,
        (depends_on_id, deliverable_id),
        one=True,
    )
    return row is not None


def add_dependency(deliverable_id, depends_on_id):
    """Records that `deliverable_id` depends on `depends_on_id`.

    Idempotent: re-adding an existing edge is a no-op rather than a 409, since
    the caller's intent is already satisfied.
    """
    return db.execute(
        """
        INSERT INTO deliverable_dependencies (deliverable_id, depends_on_id)
        VALUES (%s, %s)
        ON CONFLICT DO NOTHING
        RETURNING deliverable_id
        """,
        (deliverable_id, depends_on_id),
        one=True,
    )


def remove_dependency(deliverable_id, depends_on_id):
    return db.execute(
        """
        DELETE FROM deliverable_dependencies
        WHERE deliverable_id = %s AND depends_on_id = %s
        RETURNING deliverable_id
        """,
        (deliverable_id, depends_on_id),
        one=True,
    )


def get_dependency_chain(deliverable_id):
    """Walks the prerequisite chain from one deliverable, depth-annotated.

    This is the recursive CTE sketched at the bottom of schema.sql, with the
    deliverable's own columns joined in so the response is renderable, and with
    the same path guard against pre-existing cycles.
    """
    return db.query(
        """
        WITH RECURSIVE chain AS (
            SELECT dd.deliverable_id, dd.depends_on_id, 1 AS depth,
                   ARRAY[dd.deliverable_id] AS path
            FROM deliverable_dependencies dd
            WHERE dd.deliverable_id = %s
          UNION ALL
            SELECT dd.deliverable_id, dd.depends_on_id, c.depth + 1,
                   c.path || dd.deliverable_id
            FROM deliverable_dependencies dd
            JOIN chain c ON dd.deliverable_id = c.depends_on_id
            WHERE NOT dd.depends_on_id = ANY(c.path)
        )
        SELECT c.depth,
               c.deliverable_id,
               c.depends_on_id,
               d.name       AS depends_on_name,
               d.status     AS depends_on_status,
               d.due_date   AS depends_on_due_date,
               d.completion_percentage AS depends_on_completion
        FROM chain c
        JOIN deliverables d ON d.id = c.depends_on_id
        ORDER BY c.depth, d.name
        """,
        (deliverable_id,),
    )


def get_project_graph(project_id):
    """Every deliverable in a project plus every edge between them.

    Returned as nodes + edges so the client can lay the graph out however it
    likes rather than being handed one pre-chosen traversal.
    """
    nodes = db.query(
        """
        SELECT d.id, d.name, d.status, d.due_date, d.completion_percentage,
               (d.due_date < CURRENT_DATE
                AND d.status NOT IN ('completed','cancelled')) AS is_overdue
        FROM deliverables d
        WHERE d.project_id = %s
        ORDER BY d.due_date ASC NULLS LAST, d.name
        """,
        (project_id,),
    )

    edges = db.query(
        """
        SELECT dd.deliverable_id, dd.depends_on_id
        FROM deliverable_dependencies dd
        JOIN deliverables d ON d.id = dd.deliverable_id
        WHERE d.project_id = %s
        """,
        (project_id,),
    )

    return nodes, edges


def blocked_by_incomplete(deliverable_id):
    """Prerequisites of this deliverable that are not finished yet.

    Used to explain why an item cannot sensibly start, and to answer the
    "identify bottlenecks" part of the brief.
    """
    return db.query(
        """
        SELECT d.id, d.name, d.status, d.completion_percentage, d.due_date
        FROM deliverable_dependencies dd
        JOIN deliverables d ON d.id = dd.depends_on_id
        WHERE dd.deliverable_id = %s
          AND d.status NOT IN ('completed','cancelled')
        ORDER BY d.due_date ASC NULLS LAST
        """,
        (deliverable_id,),
    )
