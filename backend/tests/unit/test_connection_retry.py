"""Unit tests: a stale database connection is replaced once before the request runs (app/main.py).

A warm Lambda container keeps its connection between requests; the server may have closed it in the
meantime (Aurora Serverless pausing, idle timeouts, failover) and psycopg only notices on first use.
No database here: ``db.connect`` hands out fake connections and test routes stand in for handlers.
"""

import json
import logging
import re
from contextlib import contextmanager
from pathlib import Path

import psycopg
import pytest
from psycopg import errors as pg_errors

from app import main
from app.core import db
from app.core.router import Router
from helpers import ApiClient, assert_error

DB_HEALTH = {"status": "ok", "service": "pm-service", "database": "ok"}
UNAVAILABLE = "The database is currently unavailable, please try again shortly"


def server_closed():
    """What psycopg raises when it first uses a connection whose server process has ended."""
    return psycopg.OperationalError("consuming input failed: terminating connection due to administrator command")


class FakeConnection:
    """Just enough of a psycopg connection for the dispatcher.

    ``begin_error``: BEGIN fails with it; ``breaks`` says whether the failure leaves the connection
    closed and broken, as a connection the server has ended does. ``log`` records what ran.
    """

    def __init__(self, begin_error=None, *, breaks=True, close_error=None):
        self.begin_error = begin_error
        self.breaks = breaks
        self.close_error = close_error
        self.closed = self.broken = False
        self.log = []

    @contextmanager
    def transaction(self):
        if self.begin_error:
            self.closed = self.broken = self.breaks
            raise self.begin_error
        self.log.append("BEGIN")
        try:
            yield
        except BaseException:
            self.log.append("ROLLBACK")
            raise
        self.log.append("COMMIT")

    def execute(self, query, *_args):
        self.log.append(query)

    def close(self):
        self.closed = True
        if self.close_error:
            raise self.close_error


def stale():
    """A cached connection the server has closed: psycopg only finds out at BEGIN."""
    return FakeConnection(server_closed())


class FakeDatabase:
    """Replaces ``db.connect``: hands out the queued connections (or raises queued errors) in order."""

    def __init__(self):
        self.queue = []
        self.connects = 0

    def connect(self):
        self.connects += 1
        outcome = self.queue.pop(0) if self.queue else FakeConnection()
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


@pytest.fixture
def fake_db(monkeypatch):
    """A warm container (schema ready) with no cached connection yet; see ``cache``."""
    fake = FakeDatabase()
    monkeypatch.setattr(db, "connect", fake.connect)
    monkeypatch.setattr(db, "_connection", None)
    monkeypatch.setattr(db, "_schema_ready", True)
    return fake


@pytest.fixture
def cache(monkeypatch, fake_db):
    """``cache(conn)``: make ``conn`` the connection a previous request left in the container."""
    return lambda conn: monkeypatch.setattr(db, "_connection", conn)


@pytest.fixture
def handler(monkeypatch):
    """Route ``GET /work`` (public) and ``GET /private`` (authenticated) to one test handler.

    ``handler.error`` makes the handler raise; ``handler.calls`` counts how often it ran.
    """

    class Handler:
        error = None
        calls = 0

        def __call__(self, req):
            self.calls += 1
            req.conn.execute("UPDATE side_effects SET n = n + 1")
            if self.error:
                raise self.error
            return {"done": True}

    test_handler = Handler()
    router = Router()
    router.add("GET", "/work", test_handler, public=True)
    router.add("GET", "/private", test_handler)
    monkeypatch.setattr(main, "ROUTER", router)
    return test_handler


@pytest.fixture
def api():
    return ApiClient()


def reconnect_lines(caplog):
    return [json.loads(r.getMessage()) for r in caplog.records if '"db_reconnect"' in r.getMessage()]


class TestStaleConnectionIsReplaced:
    def test_the_request_succeeds_on_a_fresh_connection(self, api, fake_db, cache):
        lost = stale()
        cache(lost)
        result = api.get("/health/db")
        assert (result.status, result.body) == (200, DB_HEALTH)
        assert fake_db.connects == 1  # exactly one reconnect
        assert lost.closed
        fresh = db.get_connection()
        assert fresh is not lost
        assert fresh.log == ["BEGIN", "SELECT 1", "COMMIT"]

    def test_the_handler_runs_once_inside_the_new_transaction(self, api, fake_db, cache, handler):
        cache(stale())
        assert api.get("/work").body == {"done": True}
        assert handler.calls == 1
        assert db.get_connection().log == ["BEGIN", "UPDATE side_effects SET n = n + 1", "COMMIT"]

    def test_the_retry_is_logged_once_without_internals(self, api, fake_db, cache, caplog):
        cache(stale())
        assert api.get("/health/db").status == 200
        (line,) = reconnect_lines(caplog)
        # the error class only: psycopg's messages can name the host, database or user
        assert line == {"event": "db_reconnect", "request_id": "pytest", "error": "OperationalError"}
        warnings = [r.getMessage() for r in caplog.records if r.levelno >= logging.WARNING]
        assert warnings == [json.dumps(line)]  # nothing else is reported when the retry succeeds

    def test_a_connection_that_turns_out_broken_counts_whatever_the_error_class(self, api, fake_db, cache):
        lost = FakeConnection(psycopg.DatabaseError("server closed the connection unexpectedly"))
        cache(lost)
        assert api.get("/health/db").status == 200
        assert fake_db.connects == 1 and lost.broken

    def test_closing_the_dead_connection_may_fail(self, api, fake_db, cache):
        cache(FakeConnection(server_closed(), close_error=psycopg.OperationalError("already gone")))
        assert api.get("/health/db").status == 200
        assert fake_db.connects == 1

    def test_a_failed_connect_is_retried_once(self, api, fake_db):
        fake_db.queue = [psycopg.OperationalError("connection timeout expired")]
        assert api.get("/health/db").status == 200
        assert fake_db.connects == 2

    def test_a_failed_schema_bootstrap_is_retried_on_a_new_connection(self, api, fake_db, monkeypatch):
        used = []

        def ensure_schema(conn):
            used.append(conn)
            if len(used) == 1:
                raise server_closed()

        monkeypatch.setattr(db, "ensure_schema", ensure_schema)
        assert api.get("/health/db").status == 200
        assert fake_db.connects == 2 and used[0] is not used[1]
        assert used[0].closed and not used[1].closed


class TestRetryAlsoFails:
    def test_reconnecting_fails(self, api, fake_db, cache, handler):
        lost = stale()
        cache(lost)
        fake_db.queue = [psycopg.OperationalError("connection timeout expired")]
        error = assert_error(api.get("/work"), 500, "DATABASE_UNAVAILABLE")
        assert error["message"] == UNAVAILABLE
        assert fake_db.connects == 1 and handler.calls == 0  # one retry, never more
        assert db._connection is None and lost.closed

    def test_the_new_connection_fails_too(self, api, fake_db, cache, handler):
        cache(stale())
        second = stale()
        fake_db.queue = [second]
        error = assert_error(api.get("/work"), 500, "DATABASE_UNAVAILABLE")
        assert error["message"] == UNAVAILABLE
        assert fake_db.connects == 1 and handler.calls == 0
        assert db._connection is None and second.closed  # reset: the next request connects again

    def test_the_next_request_connects_again(self, api, fake_db, cache):
        cache(stale())
        fake_db.queue = [psycopg.OperationalError("connection timeout expired")]
        assert_error(api.get("/health/db"), 500, "DATABASE_UNAVAILABLE")
        assert api.get("/health/db").status == 200
        assert fake_db.connects == 2


class TestNoRetryOnceTheTransactionIsOpen:
    @pytest.mark.parametrize("path", ["/work", "/private"])
    def test_a_connection_lost_inside_the_request_is_unavailable_as_before(
        self, api, fake_db, cache, handler, monkeypatch, path
    ):
        conn = FakeConnection()
        cache(conn)
        monkeypatch.setattr(main, "authenticate", lambda _req: {"id": 1, "role": "admin"})
        handler.error = server_closed()
        assert_error(api.get(path), 500, "DATABASE_UNAVAILABLE")
        assert handler.calls == 1  # the handler's writes are never replayed
        assert fake_db.connects == 0
        assert conn.log[-1] == "ROLLBACK" and conn.closed and db._connection is None

    def test_a_connection_lost_during_authentication_is_not_retried(self, api, fake_db, cache, handler, monkeypatch):
        cache(FakeConnection())

        def authenticate(_req):
            raise server_closed()

        monkeypatch.setattr(main, "authenticate", authenticate)
        assert_error(api.get("/private"), 500, "DATABASE_UNAVAILABLE")
        assert fake_db.connects == 0 and handler.calls == 0


class TestOtherErrorsAreNotRetried:
    @pytest.mark.parametrize(
        ("exc", "status", "code"),
        [
            (pg_errors.InsufficientPrivilege("permission denied for schema public"), 500, "DATABASE_ERROR"),
            (psycopg.ProgrammingError("syntax error"), 500, "DATABASE_ERROR"),
            (RuntimeError("bug in the schema bootstrap"), 500, "INTERNAL_ERROR"),
        ],
    )
    def test_a_failing_schema_bootstrap(self, api, fake_db, cache, handler, monkeypatch, exc, status, code):
        conn = FakeConnection()
        cache(conn)
        attempts = []

        def ensure_schema(_conn):
            attempts.append(1)
            raise exc

        monkeypatch.setattr(db, "ensure_schema", ensure_schema)
        assert_error(api.get("/work"), status, code)
        assert len(attempts) == 1 and fake_db.connects == 0 and handler.calls == 0
        assert db._connection is conn and not conn.closed  # a healthy connection is kept

    def test_a_statement_error_on_a_healthy_connection(self, api, fake_db, cache, handler):
        conn = FakeConnection(psycopg.ProgrammingError("cannot BEGIN"), breaks=False)
        cache(conn)
        assert_error(api.get("/work"), 500, "DATABASE_ERROR")
        assert fake_db.connects == 0 and handler.calls == 0
        assert db._connection is conn


class TestConnectionLost:
    def test_no_cached_connection_yet(self, fake_db):
        assert db.connection_lost() is False

    @pytest.mark.parametrize(
        ("closed", "broken", "lost"), [(False, False, False), (True, False, True), (True, True, True)]
    )
    def test_follows_what_psycopg_found(self, cache, closed, broken, lost):
        conn = FakeConnection()
        conn.closed, conn.broken = closed, broken
        cache(conn)
        assert db.connection_lost() is lost
        assert (db.get_connection() is not conn) == lost  # a lost connection is replaced


CLOUDFRONT_TF = Path(__file__).resolve().parents[3] / "infra" / "cloudfront.tf"


class TestTimeBudget:
    """In AWS, CloudFront waits ``origin_read_timeout`` seconds for the API, then answers 504 itself."""

    def test_two_connection_attempts_end_before_cloudfront_stops_waiting(self, monkeypatch):
        # With the retry, a request whose database cannot be reached waits for two connection
        # attempts; the client must still get the API's JSON DATABASE_UNAVAILABLE, not a 504 page.
        options = {}
        monkeypatch.setattr(psycopg, "connect", lambda **kwargs: options.update(kwargs))
        db.connect()
        (origin_read_timeout,) = re.findall(r"origin_read_timeout\s*=\s*(\d+)", CLOUDFRONT_TF.read_text("utf-8"))
        startup_and_response = 5  # seconds for a cold Lambda start and sending the error back
        assert options["connect_timeout"] == db.CONNECT_TIMEOUT_SECONDS
        assert 2 * options["connect_timeout"] + startup_and_response <= int(origin_read_timeout)

    def test_one_attempt_still_outlasts_an_aurora_resume(self):
        assert db.CONNECT_TIMEOUT_SECONDS >= 20  # resuming from 0 ACU takes about 15-20 s
