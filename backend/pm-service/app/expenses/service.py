"""Business rules for expenses, the spending side of project budget tracking
(a project's ``budget_spent`` is the sum of its expenses, see ``app.projects.metrics``)."""

from app.core.errors import NotFoundError, ValidationError
from app.core.http import list_result
from app.expenses import repository
from app.expenses.schemas import ExpenseRequest
from app.projects import repository as projects_repository


def list_expenses(conn, **filters) -> dict:
    """Expenses matching the filters accepted by ``repository.list_expenses``, newest first."""
    items = repository.list_expenses(conn, **filters)
    return list_result(items)


def get_expense(conn, expense_id: int) -> dict:
    """One expense (404 when it does not exist)."""
    expense = repository.find_expense(conn, expense_id)
    if expense is None:
        raise NotFoundError("Expense not found")
    return expense


def create_expense(conn, data: ExpenseRequest) -> dict:
    """Record an expense against an existing project."""
    _check_project(conn, data.project_id)
    return get_expense(conn, repository.insert_expense(conn, data.model_dump()))


def update_expense(conn, expense_id: int, data: ExpenseRequest) -> dict:
    """Full update; the (possibly new) project must exist."""
    get_expense(conn, expense_id)
    _check_project(conn, data.project_id)
    repository.update_expense(conn, expense_id, data.model_dump())
    return get_expense(conn, expense_id)


def delete_expense(conn, expense_id: int) -> None:
    """Delete an expense (404 when it does not exist)."""
    if not repository.delete_expense(conn, expense_id):
        raise NotFoundError("Expense not found")


def _check_project(conn, project_id: int) -> None:
    """400 when the referenced project does not exist."""
    if not projects_repository.project_exists(conn, project_id):
        raise ValidationError("Validation failed", details={"project_id": "Project not found"})
