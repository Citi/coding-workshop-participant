"""Integration tests: the dispatcher's safety nets (app/main.py).

Database errors the services did not anticipate, and unexpected exceptions, still get the
documented status, code and JSON error shape; the request's writes are rolled back; a connection
the server closed while the container was idle is replaced before the request runs; and a
connection lost during a request is reported and replaced on the next request.
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


def terminate(conn) -> None:
    """End ``conn``'s server process from a second connection, as an Aurora pause or idle timeout does.

    The app's connection object does not notice: it still looks open until it is next used.
    """
    with db.connect() as admin:
        ended = admin.execute("SELECT pg_terminate_backend(%s, 5000) AS ended", (conn.info.backend_pid,))
        assert ended.fetchone()["ended"]
    assert not conn.closed


def reconnects(caplog) -> int:
    return sum('"db_reconnect"' in record.getMessage() for record in caplog.records)


def project_count() -> int:
    return db.get_connection().execute("SELECT COUNT(*) AS n FROM projects").fetchone()["n"]


class TestConnectionClosedByTheServer:
    """The first request after the server ended the container's connection succeeds first time."""

    def test_wake_up_call(self, api, caplog):
        lost = db.get_connection()
        terminate(lost)
        result = api.get("/health/db")
        assert result.status == 200, result.body
        assert lost.closed and db.get_connection() is not lost
        assert reconnects(caplog) == 1

    def test_authenticated_read(self, api, tokens, caplog):
        lost = db.get_connection()
        terminate(lost)
        result = api.get("/projects", token=tokens["viewer"])
        assert result.status == 200, result.body
        assert result.body == {"items": [], "total": 0}
        assert reconnects(caplog) == 1

    def test_a_write_runs_exactly_once(self, api, tokens, caplog):
        terminate(db.get_connection())
        result = api.post("/projects", token=tokens["manager"], body=PROJECT)
        assert result.status == 201, result.body
        assert project_count() == 1
        assert reconnects(caplog) == 1

    def test_the_next_requests_reuse_the_new_connection(self, api, tokens, caplog):
        terminate(db.get_connection())
        assert api.get("/health/db").status == 200
        replacement = db.get_connection()
        assert api.get("/projects", token=tokens["viewer"]).status == 200
        assert db.get_connection() is replacement
        assert reconnects(caplog) == 1

    def test_a_connection_lost_inside_the_handler_is_not_retried(self, api, tokens, monkeypatch, caplog):
        handled = []
        enrich = projects_service._enrich_one

        def lose_the_connection_after_the_insert(conn, project):
            handled.append(project["name"])
            terminate(conn)
            return enrich(conn, project)  # its queries fail: the server has ended the connection

        monkeypatch.setattr(projects_service, "_enrich_one", lose_the_connection_after_the_insert)
        assert_error(api.post("/projects", token=tokens["manager"], body=PROJECT), 500, "DATABASE_UNAVAILABLE")
        assert handled == [PROJECT["name"]]  # the handler ran once: nothing is replayed
        assert reconnects(caplog) == 0
        assert project_count() == 0  # the insert ended with the connection
