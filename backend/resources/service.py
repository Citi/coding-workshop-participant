"""
Database operations for resources and allocations.

Utilization comes from the v_resource_utilization view, which sums each
person's *currently active* allocations. That is the answer to "who is
over-allocated across multiple projects".
"""

from _shared import db

_SELECT = """
    SELECT r.id, r.full_name, r.email, r.role_title, r.capacity_pct,
           r.created_at, r.updated_at,
           COALESCE(v.allocated_pct, 0)      AS allocated_pct,
           COALESCE(v.project_count, 0)      AS project_count,
           COALESCE(v.is_over_allocated, FALSE) AS is_over_allocated
    FROM resources r
    LEFT JOIN v_resource_utilization v ON v.id = r.id
"""

_ALLOC_SELECT = """
    SELECT a.id, a.resource_id, a.project_id, a.allocation_pct,
           a.start_date, a.end_date, a.created_at, a.updated_at,
           r.full_name AS resource_name,
           p.name      AS project_name,
           (a.start_date <= CURRENT_DATE
            AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)) AS is_active
    FROM allocations a
    JOIN resources r ON r.id = a.resource_id
    JOIN projects  p ON p.id = a.project_id
"""


# -- Resources --------------------------------------------------------------


def list_resources(search=None, role_title=None, over_allocated=None, available_only=None):
    sql = _SELECT
    conditions = []
    params = []

    if search:
        conditions.append("(r.full_name ILIKE %s OR r.email ILIKE %s OR r.role_title ILIKE %s)")
        like = f"%{search}%"
        params.extend([like, like, like])

    if role_title:
        conditions.append("r.role_title = %s")
        params.append(role_title)

    if over_allocated is not None:
        conditions.append("COALESCE(v.is_over_allocated, FALSE) = %s")
        params.append(over_allocated)

    if available_only:
        # Anyone with headroom left against their own capacity.
        conditions.append("COALESCE(v.allocated_pct, 0) < r.capacity_pct")

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    # Most heavily loaded first -- the people needing attention lead the list.
    sql += " ORDER BY COALESCE(v.allocated_pct, 0) DESC, r.full_name ASC"
    return db.query(sql, params)


def get_resource(resource_id):
    return db.query(f"{_SELECT} WHERE r.id = %s", (resource_id,), one=True)


def create_resource(data):
    inserted = db.execute(
        """
        INSERT INTO resources (full_name, email, role_title, capacity_pct)
        VALUES (%s, %s, %s, COALESCE(%s, 100))
        RETURNING id
        """,
        (
            data.get("fullName"),
            data.get("email"),
            data.get("roleTitle"),
            data.get("capacityPct"),
        ),
        one=True,
    )
    return get_resource(inserted["id"])


_UPDATABLE = {
    "fullName": "full_name",
    "email": "email",
    "roleTitle": "role_title",
    "capacityPct": "capacity_pct",
}


def update_resource(resource_id, data):
    sets = []
    params = []

    for field, column in _UPDATABLE.items():
        if field in data:
            sets.append(f"{column} = %s")
            params.append(data[field])

    if not sets:
        return get_resource(resource_id)

    params.append(resource_id)
    updated = db.execute(
        f"UPDATE resources SET {', '.join(sets)} WHERE id = %s RETURNING id",
        params,
        one=True,
    )
    return get_resource(updated["id"]) if updated else None


def delete_resource(resource_id):
    """Deletes a resource; their allocations cascade away."""
    return db.execute(
        "DELETE FROM resources WHERE id = %s RETURNING id", (resource_id,), one=True
    )


def project_exists(project_id):
    row = db.query("SELECT 1 AS ok FROM projects WHERE id = %s", (project_id,), one=True)
    return row is not None


# -- Allocations ------------------------------------------------------------


def list_allocations(resource_id=None, project_id=None, active_only=None):
    sql = _ALLOC_SELECT
    conditions = []
    params = []

    if resource_id:
        conditions.append("a.resource_id = %s")
        params.append(resource_id)

    if project_id:
        conditions.append("a.project_id = %s")
        params.append(project_id)

    if active_only:
        conditions.append(
            "a.start_date <= CURRENT_DATE AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)"
        )

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    sql += " ORDER BY a.start_date DESC"
    return db.query(sql, params)


def get_allocation(allocation_id):
    return db.query(f"{_ALLOC_SELECT} WHERE a.id = %s", (allocation_id,), one=True)


def create_allocation(data):
    inserted = db.execute(
        """
        INSERT INTO allocations (resource_id, project_id, allocation_pct, start_date, end_date)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            data.get("resourceId"),
            data.get("projectId"),
            data.get("allocationPct"),
            data.get("startDate"),
            data.get("endDate"),
        ),
        one=True,
    )
    return get_allocation(inserted["id"])


def update_allocation(allocation_id, data):
    columns = {"allocationPct": "allocation_pct", "startDate": "start_date", "endDate": "end_date"}

    sets = []
    params = []
    for field, column in columns.items():
        if field in data:
            sets.append(f"{column} = %s")
            params.append(data[field])

    if not sets:
        return get_allocation(allocation_id)

    params.append(allocation_id)
    updated = db.execute(
        f"UPDATE allocations SET {', '.join(sets)} WHERE id = %s RETURNING id",
        params,
        one=True,
    )
    return get_allocation(updated["id"]) if updated else None


def delete_allocation(allocation_id):
    return db.execute(
        "DELETE FROM allocations WHERE id = %s RETURNING id", (allocation_id,), one=True
    )


def committed_in_window(resource_id, start_date, end_date, exclude_id=None):
    """Total percent already committed over an overlapping date window.

    Two ranges overlap when each starts on or before the other ends; a NULL end
    date means open-ended and so always extends past the other's start.

    Used to warn on over-allocation. It does not block the write -- deliberate
    over-allocation is real, and the brief asks us to surface it rather than
    forbid it.
    """
    sql = """
        SELECT COALESCE(SUM(allocation_pct), 0) AS committed
        FROM allocations
        WHERE resource_id = %s
          AND (%s IS NULL OR start_date <= %s)
          AND (end_date IS NULL OR end_date >= %s)
    """
    params = [resource_id, end_date, end_date, start_date]

    if exclude_id:
        sql += " AND id <> %s"
        params.append(exclude_id)

    row = db.query(sql, params, one=True)
    return int(row["committed"]) if row else 0


def get_utilization():
    """Every resource's current utilization, heaviest first."""
    return db.query(
        """
        SELECT v.id, v.full_name, v.role_title, v.capacity_pct,
               v.allocated_pct, v.project_count, v.is_over_allocated
        FROM v_resource_utilization v
        ORDER BY v.allocated_pct DESC, v.full_name ASC
        """
    )


def get_resource_projects(resource_id):
    """The projects one person is currently allocated to."""
    return db.query(
        """
        SELECT p.id, p.name, p.status, a.allocation_pct, a.start_date, a.end_date
        FROM allocations a
        JOIN projects p ON p.id = a.project_id
        WHERE a.resource_id = %s
          AND a.start_date <= CURRENT_DATE
          AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
        ORDER BY a.allocation_pct DESC
        """,
        (resource_id,),
    )
