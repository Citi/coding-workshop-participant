"""SQL for the projects table (always parameterized; filters are static SQL where NULL means "no filter")."""

from app.core.sql import like_pattern

PROJECT_COLUMNS = "id, name, description, department, status, start_date, end_date, budget, created_at, updated_at"

_LIST_SQL = f"""
SELECT {PROJECT_COLUMNS}
FROM projects
WHERE (%(search)s::text IS NULL
       OR name ILIKE %(search)s ESCAPE '\\'
       OR description ILIKE %(search)s ESCAPE '\\'
       OR department ILIKE %(search)s ESCAPE '\\')
  AND (%(status)s::text IS NULL OR status = %(status)s)
  AND (%(department)s::text IS NULL OR lower(department) = lower(%(department)s))
ORDER BY end_date, lower(name)
"""  # nosec B608 # only the constant column list is interpolated; values are bound parameters

_INSERT_SQL = f"""
INSERT INTO projects (name, description, department, status, start_date, end_date, budget)
VALUES (%(name)s, %(description)s, %(department)s, %(status)s, %(start_date)s, %(end_date)s, %(budget)s)
RETURNING {PROJECT_COLUMNS}
"""  # nosec B608 # only the constant column list is interpolated; values are bound parameters

_UPDATE_SQL = f"""
UPDATE projects
SET name = %(name)s, description = %(description)s, department = %(department)s, status = %(status)s,
    start_date = %(start_date)s, end_date = %(end_date)s, budget = %(budget)s, updated_at = now()
WHERE id = %(id)s
RETURNING {PROJECT_COLUMNS}
"""  # nosec B608 # only the constant column list is interpolated; values are bound parameters

_NAME_TAKEN_SQL = """
SELECT EXISTS (
    SELECT 1 FROM projects
    WHERE lower(name) = lower(%(name)s) AND (%(exclude_id)s::int IS NULL OR id <> %(exclude_id)s)
) AS taken
"""


def list_projects(conn, *, search=None, status=None, department=None) -> list[dict]:
    """Projects matching the stored-field filters, sorted by end date, then name."""
    params = {"search": like_pattern(search) if search else None, "status": status, "department": department}
    return conn.execute(_LIST_SQL, params).fetchall()


def find_project(conn, project_id: int) -> dict | None:
    """One project row, or None."""
    return conn.execute(
        f"SELECT {PROJECT_COLUMNS} FROM projects WHERE id = %s",  # nosec B608 # constant columns; the id is bound
        (project_id,),
    ).fetchone()


def project_exists(conn, project_id: int) -> bool:
    """Reference check for records that point at a project."""
    row = conn.execute("SELECT EXISTS (SELECT 1 FROM projects WHERE id = %s) AS found", (project_id,)).fetchone()
    return row["found"]


def name_taken(conn, name: str, *, exclude_id: int | None = None) -> bool:
    """Case-insensitive name check; ``exclude_id`` skips the project being updated."""
    return conn.execute(_NAME_TAKEN_SQL, {"name": name, "exclude_id": exclude_id}).fetchone()["taken"]


def insert_project(conn, values: dict) -> dict:
    """Insert a project and return the stored row."""
    return conn.execute(_INSERT_SQL, values).fetchone()


def update_project(conn, project_id: int, values: dict) -> dict | None:
    """Overwrite every editable column (PUT is a full update) and return the stored row."""
    return conn.execute(_UPDATE_SQL, {**values, "id": project_id}).fetchone()


def delete_project(conn, project_id: int) -> bool:
    """Delete a project; the database cascades to its deliverables, links, allocations and expenses."""
    return conn.execute("DELETE FROM projects WHERE id = %s", (project_id,)).rowcount > 0
