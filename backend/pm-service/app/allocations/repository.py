"""SQL for the allocations table. Every value is passed as a query parameter.

Rows are returned joined with the person's name and the project's name and status,
which is the shape the API returns.
"""

_SELECT_SQL = """
SELECT a.id, a.resource_id, r.full_name AS resource_name,
       a.project_id, p.name AS project_name, p.status AS project_status,
       a.allocation_percent, a.created_at, a.updated_at
FROM allocations a
JOIN resources r ON r.id = a.resource_id
JOIN projects p ON p.id = a.project_id
"""

_LIST_SQL = (
    _SELECT_SQL
    + """
WHERE (%(project_id)s::int IS NULL OR a.project_id = %(project_id)s)
  AND (%(resource_id)s::int IS NULL OR a.resource_id = %(resource_id)s)
ORDER BY lower(p.name), lower(r.full_name), a.id
"""
)

_FIND_SQL = _SELECT_SQL + "WHERE a.id = %s"


def list_allocations(conn, *, project_id=None, resource_id=None) -> list[dict]:
    """Allocations sorted by project name, then resource name (both filters optional)."""
    return conn.execute(_LIST_SQL, {"project_id": project_id, "resource_id": resource_id}).fetchall()


def find_allocation(conn, allocation_id: int) -> dict | None:
    """One allocation row, or None."""
    return conn.execute(_FIND_SQL, (allocation_id,)).fetchone()


def pair_taken(conn, resource_id: int, project_id: int, *, exclude_id: int | None = None) -> bool:
    """True when another allocation already links this resource to this project."""
    return conn.execute(
        """SELECT EXISTS (SELECT 1 FROM allocations
                          WHERE resource_id = %(resource_id)s AND project_id = %(project_id)s
                            AND id IS DISTINCT FROM %(exclude_id)s::int) AS taken""",
        {"resource_id": resource_id, "project_id": project_id, "exclude_id": exclude_id},
    ).fetchone()["taken"]


def insert_allocation(conn, data: dict) -> int:
    """Insert an allocation and return its id."""
    return conn.execute(
        """INSERT INTO allocations (resource_id, project_id, allocation_percent)
           VALUES (%(resource_id)s, %(project_id)s, %(allocation_percent)s)
           RETURNING id""",
        data,
    ).fetchone()["id"]


def update_allocation(conn, allocation_id: int, data: dict) -> None:
    """Replace every editable field of an allocation."""
    conn.execute(
        """UPDATE allocations
           SET resource_id = %(resource_id)s, project_id = %(project_id)s,
               allocation_percent = %(allocation_percent)s, updated_at = now()
           WHERE id = %(id)s""",
        {**data, "id": allocation_id},
    )


def delete_allocation(conn, allocation_id: int) -> bool:
    """Delete an allocation; False when the id is unknown."""
    return conn.execute("DELETE FROM allocations WHERE id = %s", (allocation_id,)).rowcount > 0
