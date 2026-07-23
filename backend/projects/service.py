"""
Database operations for projects.

Reads join v_project_health so every project carries its budget-consumed,
average-completion and at-risk figures. That means the "current status", "at
risk" and "budget consumed vs planned" questions are answered by one query
rather than by the client fetching projects and then N sets of deliverables.
"""

from _shared import db

_SELECT = """
    SELECT p.id, p.name, p.description, p.department, p.status,
           p.start_date, p.end_date, p.planned_budget, p.owner_id,
           p.created_at, p.updated_at,
           u.full_name        AS owner_name,
           h.budget_consumed,
           h.avg_completion,
           h.deliverable_count,
           h.overdue_count,
           h.at_risk
    FROM projects p
    LEFT JOIN users u           ON u.id = p.owner_id
    LEFT JOIN v_project_health h ON h.id = p.id
"""


def list_projects(search=None, status=None, department=None, owner_id=None, at_risk=None):
    """Filtered project list.

    Every filter is optional and composed into the WHERE clause with bound
    parameters -- no string interpolation of user input.
    """
    sql = _SELECT
    conditions = []
    params = []

    if search:
        conditions.append("(p.name ILIKE %s OR p.description ILIKE %s OR p.department ILIKE %s)")
        like = f"%{search}%"
        params.extend([like, like, like])

    if status:
        conditions.append("p.status = %s")
        params.append(status)

    if department:
        conditions.append("p.department = %s")
        params.append(department)

    if owner_id:
        conditions.append("p.owner_id = %s")
        params.append(owner_id)

    if at_risk is not None:
        conditions.append("h.at_risk = %s")
        params.append(at_risk)

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    # Soonest deadline first; projects with no end date sort last rather than
    # first, since a missing date is not an imminent one.
    sql += " ORDER BY p.end_date ASC NULLS LAST, p.name ASC"
    return db.query(sql, params)


def get_project(project_id):
    return db.query(f"{_SELECT} WHERE p.id = %s", (project_id,), one=True)


def create_project(data):
    """Inserts a project and returns the full row, health columns included."""
    inserted = db.execute(
        """
        INSERT INTO projects
            (name, description, department, status, start_date, end_date,
             planned_budget, owner_id)
        VALUES (%s, %s, %s, COALESCE(%s, 'planning'), %s, %s, COALESCE(%s, 0), %s)
        RETURNING id
        """,
        (
            data.get("name"),
            data.get("description"),
            data.get("department"),
            data.get("status"),
            data.get("startDate"),
            data.get("endDate"),
            data.get("plannedBudget"),
            data.get("ownerId"),
        ),
        one=True,
    )
    return get_project(inserted["id"])


# Request field -> column. Drives the dynamic UPDATE without ever letting a
# client-supplied key reach the SQL text.
_UPDATABLE = {
    "name": "name",
    "description": "description",
    "department": "department",
    "status": "status",
    "startDate": "start_date",
    "endDate": "end_date",
    "plannedBudget": "planned_budget",
    "ownerId": "owner_id",
}


def update_project(project_id, data):
    """Applies the supplied fields only.

    Returns None when the project does not exist so the route can 404.
    """
    sets = []
    params = []

    for field, column in _UPDATABLE.items():
        if field in data:
            sets.append(f"{column} = %s")
            params.append(data[field])

    if not sets:
        return get_project(project_id)

    params.append(project_id)
    updated = db.execute(
        f"UPDATE projects SET {', '.join(sets)} WHERE id = %s RETURNING id",
        params,
        one=True,
    )
    return get_project(updated["id"]) if updated else None


def delete_project(project_id):
    """Deletes a project; deliverables, allocations and expenses cascade."""
    return db.execute("DELETE FROM projects WHERE id = %s RETURNING id", (project_id,), one=True)


def owner_exists(owner_id):
    """Verifies a referenced user before accepting it.

    The FK would catch this anyway, but checking first yields a 400 naming the
    field instead of a 409 from a constraint violation.
    """
    row = db.query("SELECT 1 AS ok FROM users WHERE id = %s", (owner_id,), one=True)
    return row is not None


def get_summary(project_id):
    """Roll-up for one project: deliverable counts by status, plus budget."""
    return db.query(
        """
        SELECT p.id,
               p.name,
               p.planned_budget,
               COALESCE(h.budget_consumed, 0) AS budget_consumed,
               h.avg_completion,
               h.at_risk,
               COUNT(d.id)                                                AS total_deliverables,
               COUNT(d.id) FILTER (WHERE d.status = 'completed')          AS completed_deliverables,
               COUNT(d.id) FILTER (WHERE d.status = 'blocked')            AS blocked_deliverables,
               COUNT(d.id) FILTER (
                   WHERE d.due_date < CURRENT_DATE
                     AND d.status NOT IN ('completed','cancelled')
               )                                                          AS overdue_deliverables
        FROM projects p
        LEFT JOIN v_project_health h ON h.id = p.id
        LEFT JOIN deliverables d     ON d.project_id = p.id
        WHERE p.id = %s
        GROUP BY p.id, p.name, p.planned_budget, h.budget_consumed,
                 h.avg_completion, h.at_risk
        """,
        (project_id,),
        one=True,
    )
