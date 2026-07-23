"""
Database operations for budgets and expenses.
"""

from _shared import db

_EXPENSE_SELECT = """
    SELECT e.id, e.project_id, e.description, e.amount, e.category,
           e.incurred_on, e.created_at,
           p.name AS project_name
    FROM expenses e
    JOIN projects p ON p.id = e.project_id
"""

# Expenses are aggregated in a subquery rather than joined directly, so the
# per-project row is not multiplied by its line items.
_BUDGET_SELECT = """
    SELECT p.id, p.name, p.status, p.planned_budget,
           COALESCE(e.consumed, 0)   AS budget_consumed,
           COALESCE(e.line_count, 0) AS expense_count
    FROM projects p
    LEFT JOIN (
        SELECT project_id, SUM(amount) AS consumed, COUNT(*) AS line_count
        FROM expenses GROUP BY project_id
    ) e ON e.project_id = p.id
"""


# -- Budgets (consumed vs planned) ------------------------------------------


def list_budgets(project_id=None, overspent_only=None, status=None):
    sql = _BUDGET_SELECT
    conditions = []
    params = []

    if project_id:
        conditions.append("p.id = %s")
        params.append(project_id)

    if status:
        conditions.append("p.status = %s")
        params.append(status)

    if overspent_only:
        conditions.append("COALESCE(e.consumed, 0) > p.planned_budget")

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    # Largest overspend first.
    sql += " ORDER BY (COALESCE(e.consumed, 0) - p.planned_budget) DESC, p.name ASC"
    return db.query(sql, params)


def get_budget(project_id):
    return db.query(f"{_BUDGET_SELECT} WHERE p.id = %s", (project_id,), one=True)


def update_planned_budget(project_id, planned_budget):
    updated = db.execute(
        "UPDATE projects SET planned_budget = %s WHERE id = %s RETURNING id",
        (planned_budget, project_id),
        one=True,
    )
    return get_budget(updated["id"]) if updated else None


def get_breakdown(project_id):
    """Consumption split by category -- where the money actually went."""
    return db.query(
        """
        SELECT COALESCE(category, 'other') AS category,
               SUM(amount) AS total,
               COUNT(*)    AS line_count
        FROM expenses
        WHERE project_id = %s
        GROUP BY COALESCE(category, 'other')
        ORDER BY total DESC
        """,
        (project_id,),
    )


# -- Expenses ---------------------------------------------------------------


def list_expenses(project_id=None, category=None, since=None, until=None):
    sql = _EXPENSE_SELECT
    conditions = []
    params = []

    if project_id:
        conditions.append("e.project_id = %s")
        params.append(project_id)

    if category:
        conditions.append("e.category = %s")
        params.append(category)

    if since:
        conditions.append("e.incurred_on >= %s")
        params.append(since)

    if until:
        conditions.append("e.incurred_on <= %s")
        params.append(until)

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    sql += " ORDER BY e.incurred_on DESC, e.created_at DESC"
    return db.query(sql, params)


def get_expense(expense_id):
    return db.query(f"{_EXPENSE_SELECT} WHERE e.id = %s", (expense_id,), one=True)


def create_expense(data):
    inserted = db.execute(
        """
        INSERT INTO expenses (project_id, description, amount, category, incurred_on)
        VALUES (%s, %s, %s, %s, COALESCE(%s, CURRENT_DATE))
        RETURNING id
        """,
        (
            data.get("projectId"),
            data.get("description"),
            data.get("amount"),
            data.get("category"),
            data.get("incurredOn"),
        ),
        one=True,
    )
    return get_expense(inserted["id"])


_UPDATABLE = {
    "description": "description",
    "amount": "amount",
    "category": "category",
    "incurredOn": "incurred_on",
}


def update_expense(expense_id, data):
    sets = []
    params = []

    for field, column in _UPDATABLE.items():
        if field in data:
            sets.append(f"{column} = %s")
            params.append(data[field])

    if not sets:
        return get_expense(expense_id)

    params.append(expense_id)
    updated = db.execute(
        f"UPDATE expenses SET {', '.join(sets)} WHERE id = %s RETURNING id",
        params,
        one=True,
    )
    return get_expense(updated["id"]) if updated else None


def delete_expense(expense_id):
    return db.execute("DELETE FROM expenses WHERE id = %s RETURNING id", (expense_id,), one=True)


def project_exists(project_id):
    row = db.query("SELECT 1 AS ok FROM projects WHERE id = %s", (project_id,), one=True)
    return row is not None
