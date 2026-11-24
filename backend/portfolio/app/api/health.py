"""Public health check: confirms the service is up and the database answers."""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health", response_model=None)
def health(db: Session = Depends(get_db)) -> dict[str, Any] | JSONResponse:
    """Run ``SELECT 1`` and report service and database status with the round-trip time."""
    started = time.perf_counter()
    try:
        db.execute(text("SELECT 1")).scalar_one()
    except SQLAlchemyError as exc:
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        logger.error("Health check could not reach the database: %s", exc)
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "database": "unavailable",
                "latency_ms": latency_ms,
                "error": "SERVICE_UNAVAILABLE",
                "message": "The database is not reachable.",
                "details": [],
            },
        )
    latency_ms = round((time.perf_counter() - started) * 1000, 1)
    return {"status": "healthy", "database": "up", "latency_ms": latency_ms}
