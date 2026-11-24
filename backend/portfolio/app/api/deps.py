"""Dependencies shared by routers: pagination and the analysis date."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

from fastapi import Query


@dataclass(frozen=True)
class PageParams:
    """Validated ``limit`` and ``offset`` query parameters."""

    limit: int
    offset: int


def page_params(
    limit: int = Query(50, ge=1, le=200, description="Page size (1-200)."),
    offset: int = Query(0, ge=0, description="Number of matches to skip."),
) -> PageParams:
    """Read ``limit`` (default 50, max 200) and ``offset`` (default 0)."""
    return PageParams(limit=limit, offset=offset)


def today_utc() -> date:
    """Return today's date in UTC; engines take this as ``as_of``."""
    return datetime.now(timezone.utc).date()
