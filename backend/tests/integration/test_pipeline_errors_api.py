"""Integration tests: the dispatcher's safety nets (app/main.py).

Database errors the services did not anticipate, and unexpected exceptions, still get the
documented status, code and JSON error shape; the request's writes are rolled back; and a lost
database connection is replaced on the next request.
"""

import psycopg
import pytest
from psycopg import errors as pg_errors

from app.core import db
from app.projects import service as projects_service
from helpers import assert_error

PROJECT = {"name": "Apollo CRM", "department": "IT", "start_date": "2026-01-01", "end_date": "2026-12-31"}


def failing(exc):
    """A stand-in for a service function that raises ``exc``."""

    def fail(*_args, **_kwargs):
        raise exc

    return fail


@pytest.mark.parametrize(
    ("exc", "status", "code"),
    [
        (pg_errors.UniqueViolation("duplicate key value violates unique constraint"), 409, "CONFLICT"),
        (pg_errors.ForeignKeyViolation("insert violates foreign key constraint"), 400, "VALIDATION_ERROR"),
        (pg_errors.CheckViolation("new row violates check constraint"), 400, "VALIDATION_ERROR"),
        (pg_errors.NotNullViolation("null value in column violates not-null constraint"), 400, "VALIDATION_ERROR"),
        (psycopg.DataError("invalid byte sequence"), 400, "VALIDATION_ERROR"),
        (psycopg.ProgrammingError("syntax error at or near"), 500, "DATABASE_ERROR"),
        (RuntimeError("unexpected bug"), 500, "INTERNAL_ERROR"),
    ],
)
def test_unanticipated_errors_get_the_documented_status_and_code(api, tokens, monkeypatch, exc, status, code):
    monkeypatch.setattr(projects_service, "list_projects", failing(exc))
    error = assert_error(api.get("/projects", token=tokens["viewer"]), status, code)
    assert str(exc) not in error["message"]  # internal details never reach the client


def test_a_failing_request_is_rolled_back(api, tokens, monkeypatch, db_conn):
    # the project row is inserted, then the request fails while building the response
    monkeypatch.setattr(projects_service, "_enrich_one", failing(pg_errors.CheckViolation("late failure")))
    assert_error(api.post("/projects", token=tokens["manager"], body=PROJECT), 400, "VALIDATION_ERROR")
    assert db_conn.execute("SELECT COUNT(*) AS n FROM projects").fetchone()["n"] == 0


def test_a_lost_connection_is_reported_and_replaced(api, tokens, monkeypatch):
    lost = db.get_connection()
    error = psycopg.OperationalError("server closed the connection unexpectedly")
    monkeypatch.setattr(projects_service, "list_projects", failing(error))
    assert_error(api.get("/projects", token=tokens["viewer"]), 500, "DATABASE_UNAVAILABLE")
    assert lost.closed

    monkeypatch.undo()
    assert api.get("/projects", token=tokens["viewer"]).status == 200
    assert db.get_connection() is not lost
