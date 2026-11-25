"""HTTP routes for the expenses domain (budget tracking): CRUD under /expenses."""

from app.core.errors import ValidationError
from app.core.http import created, no_content, ok
from app.core.validation import parse_body, query_date, query_enum, query_int, query_str
from app.expenses import service
from app.expenses.schemas import EXPENSE_CATEGORIES, ExpenseRequest


def _list_filters(req) -> dict:
    """Parse the list filters; the inclusive date range must not be reversed (400 on ``date_to``)."""
    date_from, date_to = query_date(req, "date_from"), query_date(req, "date_to")
    if date_from and date_to and date_from > date_to:
        raise ValidationError("Invalid query parameter 'date_to'", details={"date_to": "Must be on or after date_from"})
    return {
        "project_id": query_int(req, "project_id"),
        "category": query_enum(req, "category", EXPENSE_CATEGORIES),
        "date_from": date_from,
        "date_to": date_to,
        "search": query_str(req, "search"),
    }


def list_expenses(req):
    """GET /expenses - filters: project_id, category, date_from, date_to, search."""
    return ok(service.list_expenses(req.conn, **_list_filters(req)))


def create_expense(req):
    """POST /expenses."""
    return created(service.create_expense(req.conn, parse_body(ExpenseRequest, req)))


def get_expense(req):
    """GET /expenses/{id}."""
    return ok(service.get_expense(req.conn, req.path_params["id"]))


def update_expense(req):
    """PUT /expenses/{id} - full update."""
    return ok(service.update_expense(req.conn, req.path_params["id"], parse_body(ExpenseRequest, req)))


def delete_expense(req):
    """DELETE /expenses/{id}."""
    service.delete_expense(req.conn, req.path_params["id"])
    return no_content()


def register(router) -> None:
    """Register expenses routes on the shared router."""
    router.add("GET", "/expenses", list_expenses, permission="expenses:read")
    router.add("POST", "/expenses", create_expense, permission="expenses:create")
    router.add("GET", "/expenses/{id}", get_expense, permission="expenses:read")
    router.add("PUT", "/expenses/{id}", update_expense, permission="expenses:update")
    router.add("DELETE", "/expenses/{id}", delete_expense, permission="expenses:delete")
