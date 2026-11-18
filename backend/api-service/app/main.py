"""FastAPI application: ACME Facility Desk API."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.api.routes import auth, dashboard, engineers, facilities, incidents, notifications
from app.core import config

logger = logging.getLogger()
logger.setLevel(logging.INFO)


class StripPathPrefix:
    """
    ASGI middleware: CloudFront forwards '/api/api-service/<path>' while the
    local dev proxy forwards '/<path>'. Normalise both to '/<path>'.
    """

    def __init__(self, app, prefix: str):
        self.app = app
        self.prefix = prefix

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"].startswith(self.prefix):
            scope = dict(scope)
            scope["path"] = scope["path"][len(self.prefix):] or "/"
            scope["raw_path"] = scope["path"].encode()
        await self.app(scope, receive, send)


app = FastAPI(
    title="ACME Facility Desk API",
    version="1.0.0",
    description="Facility incident management: auth, role-based access and incident workflow.",
)

app.include_router(auth.router)
app.include_router(incidents.router)
app.include_router(dashboard.router)
app.include_router(facilities.router)
app.include_router(engineers.router)
app.include_router(notifications.router)

if config.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
    )
app.add_middleware(StripPathPrefix, prefix=config.PATH_PREFIX)


# ---- consistent error shape: {"message": "..."} -------------------------

@app.exception_handler(HTTPException)
async def http_error(_request: Request, exc: HTTPException):
    return JSONResponse({"message": exc.detail}, status_code=exc.status_code, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError):
    errors = exc.errors()
    first = errors[0] if errors else {}
    msg = str(first.get("msg", "Invalid request.")).removeprefix("Value error, ")
    field = ".".join(str(p) for p in first.get("loc", ())[1:])
    # Our own validators already produce full sentences; prefix field for built-in ones
    if field and not msg.endswith("."):
        msg = f"{field}: {msg}"
    return JSONResponse({"message": msg, "errors": jsonable_errors(errors)}, status_code=422)


def jsonable_errors(errors):
    return [{"loc": list(e.get("loc", ())), "msg": str(e.get("msg"))} for e in errors]


@app.exception_handler(Exception)
async def unhandled_error(_request: Request, exc: Exception):
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse({"message": "Something went wrong. Please try again."}, status_code=500)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}
