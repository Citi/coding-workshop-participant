"""Integration tests: authentication endpoints and the request pipeline (real database)."""

from datetime import timedelta

import psycopg
import pytest

from app.auth.tokens import ACCESS, create_token
from app.core import db
from helpers import DEFAULT_PASSWORDS, assert_error


class TestLogin:
    @pytest.mark.parametrize("role", list(DEFAULT_PASSWORDS))
    def test_seeded_accounts_can_log_in(self, api, role):
        email, password = DEFAULT_PASSWORDS[role]
        result = api.post("/auth/login", body={"email": email.upper(), "password": password})
        assert result.status == 200
        body = result.body
        assert body["token_type"] == "Bearer" and body["expires_in"] == 1800
        assert body["access_token"] and body["refresh_token"]
        assert body["user"]["role"] == role and "password_hash" not in body["user"]
        assert isinstance(body["user"]["permissions"], list)

    def test_wrong_password(self, api):
        assert_error(
            api.post("/auth/login", body={"email": "admin@acme.com", "password": "nope"}), 401, "INVALID_CREDENTIALS"
        )

    def test_unknown_email(self, api):
        assert_error(
            api.post("/auth/login", body={"email": "ghost@acme.com", "password": "x"}), 401, "INVALID_CREDENTIALS"
        )

    def test_missing_fields(self, api):
        error = assert_error(api.post("/auth/login", body={}), 400, "VALIDATION_ERROR")
        assert set(error["details"]) == {"email", "password"}

    def test_malformed_json(self, api):
        assert_error(api.post("/auth/login", raw_body="{not json"), 400, "INVALID_JSON")

    def test_disabled_account(self, api, db_conn):
        db_conn.execute("UPDATE users SET is_active = FALSE WHERE email = 'viewer@acme.com'")
        assert_error(
            api.post("/auth/login", body={"email": "viewer@acme.com", "password": "Viewer@123"}),
            403,
            "ACCOUNT_DISABLED",
        )


class TestSession:
    def test_me_returns_current_user_and_permissions(self, api, tokens):
        result = api.get("/auth/me", token=tokens["contributor"])
        assert result.status == 200
        assert result.body["email"] == "contributor@acme.com"
        assert "projects:create" in result.body["permissions"]
        assert "projects:delete" not in result.body["permissions"]

    def test_me_requires_token(self, api):
        assert_error(api.get("/auth/me"), 401, "AUTH_REQUIRED")

    def test_malformed_authorization_header(self, api):
        assert_error(api.get("/auth/me", headers={"authorization": "Token abc"}), 401, "INVALID_TOKEN")

    def test_expired_token(self, api):
        token = create_token({"id": 1, "role": "admin"}, ACCESS, timedelta(seconds=-1))
        assert_error(api.get("/auth/me", token=token), 401, "TOKEN_EXPIRED")

    def test_token_of_deleted_user(self, api, tokens, db_conn):
        db_conn.execute("DELETE FROM users WHERE email = 'viewer@acme.com'")
        assert_error(api.get("/auth/me", token=tokens["viewer"]), 401, "INVALID_TOKEN")

    def test_deactivated_user_is_logged_out(self, api, tokens, db_conn):
        db_conn.execute("UPDATE users SET is_active = FALSE WHERE email = 'viewer@acme.com'")
        assert_error(api.get("/auth/me", token=tokens["viewer"]), 401, "ACCOUNT_DISABLED")

    def test_role_change_applies_immediately(self, api, tokens, db_conn):
        db_conn.execute("UPDATE users SET role = 'viewer' WHERE email = 'manager@acme.com'")
        assert api.get("/auth/me", token=tokens["manager"]).body["role"] == "viewer"


class TestRefresh:
    def test_refresh_issues_new_tokens(self, api):
        login = api.post("/auth/login", body={"email": "admin@acme.com", "password": "Admin@123"}).body
        result = api.post("/auth/refresh", body={"refresh_token": login["refresh_token"]})
        assert result.status == 200 and result.body["access_token"]
        assert api.get("/auth/me", token=result.body["access_token"]).status == 200

    def test_access_token_is_not_a_refresh_token(self, api, tokens):
        assert_error(api.post("/auth/refresh", body={"refresh_token": tokens["admin"]}), 401, "INVALID_TOKEN")

    def test_refresh_for_disabled_user(self, api, db_conn):
        login = api.post("/auth/login", body={"email": "viewer@acme.com", "password": "Viewer@123"}).body
        db_conn.execute("UPDATE users SET is_active = FALSE WHERE email = 'viewer@acme.com'")
        assert_error(api.post("/auth/refresh", body={"refresh_token": login["refresh_token"]}), 401, "INVALID_TOKEN")


class TestPipeline:
    def test_health_is_public(self, api):
        assert api.get("/health").body == {"status": "ok", "service": "pm-service"}
        assert api.get("/api/pm-service").status == 200

    def test_cloud_style_prefixed_path(self, api, tokens):
        assert api.get("/api/pm-service/auth/me", token=tokens["admin"]).status == 200

    def test_unknown_route_is_404(self, api):
        assert_error(api.get("/does-not-exist"), 404, "NOT_FOUND")

    def test_wrong_method_is_405(self, api):
        assert_error(api.get("/auth/login"), 405, "METHOD_NOT_ALLOWED")

    def test_options_preflight(self, api):
        result = api.request("OPTIONS", "/projects")
        assert result.status == 204 and result.raw == ""

    def test_base64_body(self, api):
        result = api.post("/auth/login", body={"email": "admin@acme.com", "password": "Admin@123"}, base64_body=True)
        assert result.status == 200

    def test_seeding_happens_only_once(self, db_conn):
        from app.auth.seed import seed_default_users

        seed_default_users(db_conn)
        assert db_conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 4


class RecordingConnection:
    """Wraps the real connection and records the SQL of every ``execute`` call."""

    def __init__(self, conn, statements: list):
        self._conn = conn
        self.statements = statements

    def execute(self, query, *args, **kwargs):
        self.statements.append(query)
        return self._conn.execute(query, *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._conn, name)


def failing(exc):
    """A stand-in for a function that raises ``exc``."""

    def fail(*_args, **_kwargs):
        raise exc

    return fail


class TestDatabaseHealth:
    BODY = {"status": "ok", "service": "pm-service", "database": "ok"}

    def test_is_public(self, api):
        result = api.get("/health/db")
        assert (result.status, result.body) == (200, self.BODY)
        assert api.get("/api/pm-service/health/db").body == self.BODY

    def test_ignores_a_stale_token(self, api):
        assert api.get("/health/db", token="expired-or-garbage").body == self.BODY

    def test_queries_the_database_and_bootstraps_the_schema_on_a_cold_start(self, api, monkeypatch):
        statements = []
        real_connection = db.get_connection()
        monkeypatch.setattr(db, "_schema_ready", False)  # a freshly started Lambda container
        monkeypatch.setattr(db, "get_connection", lambda: RecordingConnection(real_connection, statements))
        assert api.get("/health/db").body == self.BODY
        assert db._schema_ready is True
        assert db.SCHEMA_FILE.read_text(encoding="utf-8") in statements
        assert statements[-1] == "SELECT 1"

    @pytest.mark.parametrize("method", ["POST", "PUT", "DELETE", "PATCH"])
    def test_wrong_method_is_405(self, api, method):
        assert_error(api.request(method, "/health/db"), 405, "METHOD_NOT_ALLOWED")

    def test_options_preflight_never_reaches_the_database(self, api, monkeypatch):
        monkeypatch.setattr(db, "get_connection", lambda: pytest.fail("OPTIONS must not open a connection"))
        result = api.request("OPTIONS", "/health/db", token="expired-or-garbage")
        assert result.status == 204 and result.raw == ""

    def test_database_outage_is_reported(self, api, monkeypatch):
        attempts = []

        def unreachable():
            attempts.append("connect")
            raise psycopg.OperationalError("connection refused")

        monkeypatch.setattr(db, "get_connection", unreachable)
        assert_error(api.get("/health/db"), 500, "DATABASE_UNAVAILABLE")
        assert attempts == ["connect", "connect"]  # one reconnect, then the outage is reported

    def test_a_retry_succeeds_once_the_database_is_back(self, api, monkeypatch):
        cached = db.get_connection()
        monkeypatch.setattr(db, "ensure_schema", failing(psycopg.OperationalError("server closed the connection")))
        assert_error(api.get("/health/db"), 500, "DATABASE_UNAVAILABLE")
        assert cached.closed  # the broken connection is dropped, not reused

        monkeypatch.undo()
        assert api.get("/health/db").body == self.BODY

    def test_other_database_failures_are_database_errors(self, api, monkeypatch):
        monkeypatch.setattr(db, "ensure_schema", failing(psycopg.errors.InsufficientPrivilege("permission denied")))
        error = assert_error(api.get("/health/db"), 500, "DATABASE_ERROR")
        assert "permission denied" not in error["message"]
