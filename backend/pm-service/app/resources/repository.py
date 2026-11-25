"""SQL for the resources table. Every value is passed as a query parameter."""

from app.core.sql import like_pattern

RESOURCE_COLUMNS = "id, full_name, email, job_title, department, created_at, updated_at"

_LIST_SQL = f"""
SELECT {RESOURCE_COLUMNS}
FROM resources
WHERE (%(search)s::text IS NULL
       OR full_name ILIKE %(search)s ESCAPE '\\'
       OR email ILIKE %(search)s ESCAPE '\\'
       OR job_title ILIKE %(search)s ESCAPE '\\')
  AND (%(department)s::text IS NULL OR lower(department) = lower(%(department)s))
ORDER BY lower(full_name), id
"""  # nosec B608 # only the constant column list is interpolated; values are bound parameters


def list_resources(conn, *, search=None, department=None) -> list[dict]:
    """Resources sorted by name; ``search`` matches name/email/job title, ``department`` is exact."""
    params = {"search": like_pattern(search) if search else None, "department": department}
    return conn.execute(_LIST_SQL, params).fetchall()


def find_resource(conn, resource_id: int) -> dict | None:
    """One resource row, or None."""
    return conn.execute(
        f"SELECT {RESOURCE_COLUMNS} FROM resources WHERE id = %s",  # nosec B608 # constant columns; the id is bound
        (resource_id,),
    ).fetchone()


def resource_exists(conn, resource_id: int) -> bool:
    """Reference check for records that point at a resource."""
    row = conn.execute("SELECT EXISTS (SELECT 1 FROM resources WHERE id = %s) AS found", (resource_id,)).fetchone()
    return row["found"]


def email_taken(conn, email: str, *, exclude_id: int | None = None) -> bool:
    """True when another resource already uses this email (case-insensitive)."""
    return conn.execute(
        """SELECT EXISTS (SELECT 1 FROM resources
                          WHERE lower(email) = lower(%(email)s)
                            AND id IS DISTINCT FROM %(exclude_id)s::int) AS taken""",
        {"email": email, "exclude_id": exclude_id},
    ).fetchone()["taken"]


def insert_resource(conn, data: dict) -> dict:
    """Insert a resource and return the stored row."""
    return conn.execute(
        f"""INSERT INTO resources (full_name, email, job_title, department)
            VALUES (%(full_name)s, %(email)s, %(job_title)s, %(department)s)
            RETURNING {RESOURCE_COLUMNS}""",  # nosec B608 # constant columns; values are bound parameters
        data,
    ).fetchone()


def update_resource(conn, resource_id: int, data: dict) -> dict | None:
    """Replace every editable field; returns the stored row (None when the id is unknown)."""
    return conn.execute(
        f"""UPDATE resources
            SET full_name = %(full_name)s, email = %(email)s, job_title = %(job_title)s,
                department = %(department)s, updated_at = now()
            WHERE id = %(id)s
            RETURNING {RESOURCE_COLUMNS}""",  # nosec B608 # constant columns; values are bound parameters
        {**data, "id": resource_id},
    ).fetchone()


def delete_resource(conn, resource_id: int) -> bool:
    """Delete a resource; the schema removes its allocations and clears deliverable owners."""
    return conn.execute("DELETE FROM resources WHERE id = %s", (resource_id,)).rowcount > 0
