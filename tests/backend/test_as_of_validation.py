"""``as_of`` is a strict ``YYYY-MM-DD`` date on every route that accepts it.

Without the strict type, lax parsing would read ``as_of=0`` as 1970-01-01 (a Unix
timestamp) and quietly score the portfolio on the wrong day.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Project
from app.db.seed import seed_portfolio
from conftest import TEST_PASSWORD

T = date(2026, 11, 25)

# Every route with an as_of query parameter; {alpha} is replaced by Project Alpha's id.
ROUTES = (
    "/projects",
    "/projects/{alpha}",
    "/projects/{alpha}/risk",
    "/projects/{alpha}/dependency-graph",
    "/analytics/dashboard",
    "/analytics/capacity",
    "/analytics/budget",
    "/analytics/risk",
)

# Timestamp, datetime, unpadded, impossible day, words and empty: all must be rejected.
BAD_VALUES = ("0", "1764028800", "2026-11-25T00:00:00", "2026-1-5", "2026-02-30", "today", "")


@pytest.fixture
def alpha_id(db_session: Session) -> int:
    """Seed the spec section 10 portfolio and return Project Alpha's id."""
    seed_portfolio(db_session, TEST_PASSWORD, today=T)
    return int(db_session.scalar(select(Project.id).where(Project.project_name.like("Project Alpha%"))))


@pytest.mark.parametrize("route", ROUTES)
@pytest.mark.parametrize("value", BAD_VALUES)
def test_as_of_must_be_yyyy_mm_dd(
    client: TestClient, auth_headers: Callable[..., dict[str, str]], route: str, value: str
) -> None:
    """A non-ISO as_of is 400 VALIDATION_ERROR naming as_of; it is checked before any lookup."""
    response = client.get(route.format(alpha=1), params={"as_of": value}, headers=auth_headers("VIEWER"))
    assert response.status_code == 400, response.text
    body = response.json()
    assert body["error"] == "VALIDATION_ERROR"
    assert [detail["field"] for detail in body["details"]] == ["as_of"]


@pytest.mark.parametrize("route", ROUTES)
def test_iso_as_of_is_accepted(
    client: TestClient, auth_headers: Callable[..., dict[str, str]], alpha_id: int, route: str
) -> None:
    """A YYYY-MM-DD as_of is accepted on every route."""
    response = client.get(
        route.format(alpha=alpha_id), params={"as_of": T.isoformat()}, headers=auth_headers("VIEWER")
    )
    assert response.status_code == 200, response.text


def test_as_of_changes_the_answer_only_when_valid(
    client: TestClient, auth_headers: Callable[..., dict[str, str]], alpha_id: int
) -> None:
    """On the seed day Alpha scores the golden 78; a timestamp is refused rather than scored as 1970."""
    headers = auth_headers("VIEWER")
    detail = client.get(f"/projects/{alpha_id}", params={"as_of": T.isoformat()}, headers=headers)
    assert detail.status_code == 200, detail.text
    risk = client.get(f"/projects/{alpha_id}/risk", params={"as_of": T.isoformat()}, headers=headers)
    assert risk.status_code == 200, risk.text
    assert risk.json()["risk_score"] == 78
    assert client.get(f"/projects/{alpha_id}", params={"as_of": "0"}, headers=headers).status_code == 400
