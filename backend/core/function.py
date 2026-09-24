"""FastAPI app for the core service, exposed to AWS Lambda through Mangum."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum

import setup_tasks
from config import settings
from errors import (
    AppError,
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
)
from routers import admin, auth, engineer, health, locations, tickets

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# CloudFront forwards /api/core* to this Lambda unchanged, so every route lives under this prefix.
API_PREFIX = "/api/core"

# Services raise these without knowing about HTTP; this is the one place they become status codes.
ERROR_STATUS: dict[type[AppError], int] = {
    BadRequestError: 400,
    UnauthorizedError: 401,
    ForbiddenError: 403,
    NotFoundError: 404,
    ConflictError: 409,
}

app = FastAPI(title="Facilities Helpdesk API")

# Only needed locally (Vite :3000 -> Uvicorn :8000). In AWS the browser calls the
# same CloudFront origin, and the Function URL already has its own CORS config.
if settings.is_local:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.exception_handler(AppError)
def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
    """Turn a domain error into its HTTP status, in FastAPI's usual {"detail": ...} shape."""
    status_code = next(
        (code for error_class, code in ERROR_STATUS.items() if isinstance(exc, error_class)),
        500,
    )
    return JSONResponse(status_code=status_code, content={"detail": exc.message})


@app.exception_handler(Exception)
def handle_unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
    """Log anything unexpected and return a generic JSON 500 without internals."""
    logger.exception("Unhandled error", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(health.router, prefix=API_PREFIX)
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(locations.router, prefix=API_PREFIX)
app.include_router(tickets.router, prefix=API_PREFIX)
app.include_router(admin.router, prefix=API_PREFIX)
app.include_router(engineer.router, prefix=API_PREFIX)

_asgi_handler = Mangum(app, lifespan="off")


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Lambda entry point: Terraform wires Python services to function.handler.

    Events with a top-level "setup_task" key come from `aws lambda invoke` and go to
    setup_tasks (see there). Everything else is an HTTP request for the API.
    """
    if isinstance(event, dict) and "setup_task" in event:
        return setup_tasks.run(event)
    return _asgi_handler(event, context)
