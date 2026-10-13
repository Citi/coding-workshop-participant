"""
Archive endpoints (admin only).

Nothing is ever hard-deleted; "deleting" moves a record here, where an admin
can review and restore it.
"""

from ..db import execute, fetch_all, fetch_one
from ..errors import ConflictError, NotFoundError, ValidationError
from ..permissions import require_roles
from ..router import Context, router
from ..validation import parse_id

_TABLES = {
    "users": "users",
    "projects": "projects",
    "milestones": "milestones",
    "time-entries": "time_entries",
}


@router.add("GET", "/archive")
def list_archive(ctx: Context) -> tuple[int, dict]:
    """Everything archived, grouped by type."""
    require_roles(ctx.user, "admin")
    conn = ctx.conn
    return 200, {
        "users": fetch_all(conn,
                           """SELECT u.id, u.name, u.email, u.username, u.role, u.job_title, u.archived_at,
                                     a.name AS archived_by_name
                              FROM users u LEFT JOIN users a ON a.id = u.archived_by
                              WHERE u.archived_at IS NOT NULL ORDER BY u.archived_at DESC"""),
        "projects": fetch_all(conn,
                              """SELECT p.id, p.name, p.status, p.start_date, p.estimated_end_date, p.budget,
                                        m.name AS manager_name, p.archived_at, a.name AS archived_by_name,
                                        COALESCE((SELECT sum(hours) FROM time_entries t
                                                  WHERE t.project_id = p.id AND t.archived_at IS NULL), 0) AS total_hours
                                 FROM projects p JOIN users m ON m.id = p.manager_id
                                 LEFT JOIN users a ON a.id = p.archived_by
                                 WHERE p.archived_at IS NOT NULL ORDER BY p.archived_at DESC"""),
        "milestones": fetch_all(conn,
                                """SELECT ms.id, ms.name, ms.status, ms.start_date, ms.end_date, ms.budget,
                                          p.name AS project_name, ms.archived_at, a.name AS archived_by_name
                                   FROM milestones ms JOIN projects p ON p.id = ms.project_id
                                   LEFT JOIN users a ON a.id = ms.archived_by
                                   WHERE ms.archived_at IS NOT NULL ORDER BY ms.archived_at DESC"""),
        "time_entries": fetch_all(conn,
                                  """SELECT t.id, t.work_date, t.hours, t.note, u.name AS user_name,
                                            p.name AS project_name, t.archived_at, a.name AS archived_by_name
                                     FROM time_entries t JOIN users u ON u.id = t.user_id
                                     JOIN projects p ON p.id = t.project_id
                                     LEFT JOIN users a ON a.id = t.archived_by
                                     WHERE t.archived_at IS NOT NULL ORDER BY t.archived_at DESC LIMIT 500"""),
    }


@router.add("POST", "/archive/{kind}/{id}/restore")
def restore(ctx: Context) -> tuple[int, dict]:
    """Restore an archived record back to active use."""
    require_roles(ctx.user, "admin")
    kind = ctx.params["kind"]
    if kind not in _TABLES:
        raise ValidationError(f"Unknown archive type '{kind}'.")
    table = _TABLES[kind]
    record_id = parse_id(ctx.params["id"])
    row = fetch_one(ctx.conn, f"SELECT * FROM {table} WHERE id = %s", (record_id,))  # table from allow-list  # nosec B608
    if row is None:
        raise NotFoundError("Record not found.")
    if row["archived_at"] is None:
        raise ConflictError("This record is not archived.")

    if kind == "milestones" or kind == "time-entries":
        parent = fetch_one(ctx.conn, "SELECT archived_at FROM projects WHERE id = %s", (row["project_id"],))
        if parent["archived_at"] is not None:
            raise ConflictError("Restore the parent project first.")
    if kind == "time-entries":
        user = fetch_one(ctx.conn, "SELECT archived_at FROM users WHERE id = %s", (row["user_id"],))
        if user["archived_at"] is not None:
            raise ConflictError("Restore the employee first.")
    if kind == "projects":
        manager = fetch_one(ctx.conn, "SELECT archived_at, role FROM users WHERE id = %s", (row["manager_id"],))
        if manager["archived_at"] is not None or manager["role"] != "manager":
            raise ConflictError("This project's manager is no longer active. Restore or reassign the manager first.")
    if kind == "users" and row.get("manager_id"):
        manager = fetch_one(ctx.conn, "SELECT archived_at FROM users WHERE id = %s", (row["manager_id"],))
        if manager["archived_at"] is not None:
            execute(ctx.conn, "UPDATE users SET manager_id = NULL WHERE id = %s", (record_id,))

    execute(ctx.conn, f"UPDATE {table} SET archived_at = NULL, archived_by = NULL WHERE id = %s",  # nosec B608
            (record_id,))
    return 200, {"message": "Restored.", "kind": kind, "id": record_id}
