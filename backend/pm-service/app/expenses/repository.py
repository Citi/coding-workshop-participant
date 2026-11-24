"""SQL for the expenses table. Every value is passed as a query parameter.

Rows are returned joined with the project's name, which is the shape the API returns.
"""

from app.core.sql import like_pattern

_SELECT_SQL = """
SELECT e.id, e.project_id, p.name AS project_name, e.category, e.description,
       e.amount, e.expense_date, e.created_at, e.updated_at
FROM expenses e
JOIN projects p ON p.id = e.project_id
"""

_LIST_SQL = (
    _SELECT_SQL
    + """
WHERE (%(project_id)s::int IS NULL OR e.project_id = %(project_id)s)
  AND (%(category)s::text IS NULL OR e.category = %(category)s)
  AND (%(date_from)s::date IS NULL OR e.expense_date >= %(date_from)s)
  AND (%(date_to)s::date IS NULL OR e.expense_date <= %(date_to)s)
  AND (%(search)s::text IS NULL OR e.description ILIKE %(search)s ESCAPE '\\')
ORDER BY e.expense_date DESC, e.id DESC
"""
)

_FIND_SQL = _SELECT_SQL + "WHERE e.id = %s"


def list_expenses(conn, *, project_id=None, category=None, date_from=None, date_to=None, search=None) -> list[dict]:
    """Expenses, newest first; every filter is optional and the date range is inclusive."""
    params = {
        "project_id": project_id,
        "category": category,
        "date_from": date_from,
        "date_to": date_to,
        "search": like_pattern(search) if search else None,
    }
    return conn.execute(_LIST_SQL, params).fetchall()


def find_expense(conn, expense_id: int) -> dict | None:
    """One expense row, or None."""
    return conn.execute(_FIND_SQL, (expense_id,)).fetchone()


def insert_expense(conn, data: dict) -> int:
    """Insert an expense and return its id."""
    return conn.execute(
        """INSERT INTO expenses (project_id, category, description, amount, expense_date)
           VALUES (%(project_id)s, %(category)s, %(description)s, %(amount)s, %(expense_date)s)
           RETURNING id""",
        data,
    ).fetchone()["id"]


def update_expense(conn, expense_id: int, data: dict) -> None:
    """Replace every editable field of an expense."""
    conn.execute(
        """UPDATE expenses
           SET project_id = %(project_id)s, category = %(category)s, description = %(description)s,
               amount = %(amount)s, expense_date = %(expense_date)s, updated_at = now()
           WHERE id = %(id)s""",
        {**data, "id": expense_id},
    )


def delete_expense(conn, expense_id: int) -> bool:
    """Delete an expense; False when the id is unknown."""
    return conn.execute("DELETE FROM expenses WHERE id = %s", (expense_id,)).rowcount > 0
