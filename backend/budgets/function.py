"""
Budgets service — Lambda entry point.

Routes:
    GET    /budgets                 auth    consumed vs planned, all projects
    GET    /budgets/{projectId}     auth    one project + category breakdown
    PUT    /budgets/{projectId}     update  set the planned figure
    GET    /expenses                auth    filterable line items
    POST   /expenses                create  warns when it tips the project over
    GET    /expenses/{id}           auth
    PUT    /expenses/{id}           update
    DELETE /expenses/{id}           delete
    GET    /health                  public

Query parameters: projectId, status, overspentOnly on /budgets;
projectId, category, since, until on /expenses.
"""

import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import routes  # noqa: E402
from _shared import db  # noqa: E402
from _shared.responses import ok, server_error  # noqa: E402
from _shared.router import Router  # noqa: E402

logger = logging.getLogger()
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))


def _health(event):
    if db.health_check():
        return ok({"status": "ok", "service": "budgets"})
    return server_error("Database is unreachable")


router = Router("budgets")

router.add("GET", "/health", _health)

router.add("GET", "/budgets", routes.list_budgets)
router.add("GET", "/budgets/{projectId}", routes.get_budget)
router.add("PUT", "/budgets/{projectId}", routes.update_planned)

router.add("GET", "/expenses", routes.list_expenses)
router.add("POST", "/expenses", routes.create_expense)
router.add("GET", "/expenses/{id}", routes.get_expense)
router.add("PUT", "/expenses/{id}", routes.update_expense)
router.add("DELETE", "/expenses/{id}", routes.delete_expense)

router.add("GET", "/", routes.list_budgets)


def handler(event=None, context=None):
    """Lambda entry point."""
    return router.dispatch(event or {})


if __name__ == "__main__":
    print(handler({"rawPath": "/health", "requestContext": {"http": {"method": "GET"}}}))
