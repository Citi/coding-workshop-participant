"""FastAPI application factory for the portfolio service."""

from __future__ import annotations

from fastapi import FastAPI

from app.api import (
    allocations,
    analytics,
    audit_logs,
    auth,
    budget_entries,
    deliverables,
    departments,
    dependencies,
    health,
    projects,
    users,
)
from app.config import get_settings
from app.errors import register_error_handlers

# Order matters only where paths could overlap; fixed paths are declared before {id} paths inside each router.
_ROUTERS = (
    health.router,
    auth.router,
    users.router,
    departments.router,
    projects.router,
    deliverables.router,
    dependencies.router,
    allocations.router,
    budget_entries.router,
    analytics.router,
    audit_logs.router,
)


def create_app() -> FastAPI:
    """Build the application: settings check, routers and error handlers. No CORS middleware.

    The Lambda Function URL and the local proxy already add CORS headers; adding them here
    as well would duplicate them and browsers would reject the responses.
    """
    settings = get_settings()
    settings.require_jwt_secret()
    app = FastAPI(
        title="ACME Project Intelligence Platform",
        version="1.0.0",
        redirect_slashes=False,
        docs_url="/docs" if settings.is_local else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.is_local else None,
    )
    for router in _ROUTERS:
        app.include_router(router)
    register_error_handlers(app)
    return app
