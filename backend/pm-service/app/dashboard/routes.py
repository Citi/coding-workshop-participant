"""Dashboard endpoint: GET /dashboard, the portfolio overview (every role may read it)."""

from app.core.http import ok
from app.dashboard import service


def get_dashboard(req):
    """GET /dashboard"""
    return ok(service.build_dashboard(req.conn))


def register(router) -> None:
    """Register the dashboard route on the shared router."""
    router.add("GET", "/dashboard", get_dashboard, permission="dashboard:read")
