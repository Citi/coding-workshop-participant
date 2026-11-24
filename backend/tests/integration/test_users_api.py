"""Integration tests: /users endpoints (admin-only account management) on a real database.

Seeded accounts (see conftest.py): 1 admin, 2 manager, 3 contributor, 4 viewer.
"""

from datetime import UTC, datetime

import pytest

from app.auth.passwords import hash_password, verify_password
from app.users import repository as users_repository
from helpers import assert_error

ADMIN_ID = 1
NON_ADMIN_ROLES = ("manager", "contributor", "viewer")
SEEDED_NAMES = ["Project Manager", "Read-only Viewer", "System Administrator", "Team Contributor"]
PASSWORD = "Welcome2026"
USER_FIELDS = {"id", "email", "full_name", "role", "is_active", "created_at", "updated_at"}
BODY = {"email": "jane@acme.com", "full_name": "Jane Doe", "role": "manager", "password": PASSWORD}
UPDATE_BODY = {"email": "jane@acme.com", "full_name": "Jane Doe", "role": "manager", "is_active": True}
ADMIN_BODY = {"email": "admin@acme.com", "full_name": "System Administrator", "role": "admin", "is_active": True}
PAST = datetime(2020, 1, 1, tzinfo=UTC)


def add_user(db_conn, email="jane@acme.com", full_name="Jane Doe", role="manager", is_active=True):
    """Insert a user directly; every arranged user has the password PASSWORD."""
    return db_conn.execute(
        "INSERT INTO users (email, full_name, role, is_active, password_hash) VALUES (%s, %s, %s, %s, %s) RETURNING id",
        (email, full_name, role, is_active, hash_password(PASSWORD)),
    ).fetchone()["id"]


def stored_user(db_conn, user_id):
    return db_conn.execute(
        "SELECT email, full_name, role, is_active, password_hash, created_at, updated_at FROM users WHERE id = %s",
        (user_id,),
    ).fetchone()


def count_users(db_conn):
    return db_conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]


def login(api, email, password):
    return api.post("/auth/login", body={"email": email, "password": password})


def names(result):
    return [item["full_name"] for item in result.body["items"]]


class TestCreateUser:
    def test_creates_user_with_normalised_values_and_hashed_password(self, api, tokens, db_conn):
        body = {"email": " Jane@ACME.com ", "full_name": "  Jane Doe ", "role": "manager", "password": PASSWORD}
        result = api.post("/users", token=tokens["admin"], body=body)
        assert result.status == 201
        assert set(result.body) == USER_FIELDS
        expected = {"id": 5, "email": "jane@acme.com", "full_name": "Jane Doe", "role": "manager", "is_active": True}
        assert {key: result.body[key] for key in expected} == expected
        assert "password" not in result.raw and PASSWORD not in result.raw
        stored = stored_user(db_conn, 5)
        assert {key: stored[key] for key in ("email", "full_name", "role", "is_active")} == {
            key: expected[key] for key in ("email", "full_name", "role", "is_active")
        }
        assert stored["password_hash"] != PASSWORD and verify_password(PASSWORD, stored["password_hash"])

    def test_new_user_can_log_in_with_their_role(self, api, tokens):
        api.post("/users", token=tokens["admin"], body={**BODY, "role": "contributor"})
        result = login(api, "jane@acme.com", PASSWORD)
        assert result.status == 200 and result.body["user"]["role"] == "contributor"

    def test_inactive_account_is_stored_but_cannot_log_in(self, api, tokens, db_conn):
        result = api.post("/users", token=tokens["admin"], body={**BODY, "is_active": False})
        assert result.status == 201 and result.body["is_active"] is False
        assert stored_user(db_conn, result.body["id"])["is_active"] is False
        assert_error(login(api, "jane@acme.com", PASSWORD), 403, "ACCOUNT_DISABLED")

    def test_ignores_unknown_and_read_only_fields(self, api, tokens, db_conn):
        body = {**BODY, "id": 99, "password_hash": "not-a-hash", "created_at": "2001-01-01T00:00:00+00:00", "x": 1}
        result = api.post("/users", token=tokens["admin"], body=body)
        assert result.status == 201 and result.body["id"] == 5 and "x" not in result.body
        assert result.body["created_at"] > "2001"
        assert verify_password(PASSWORD, stored_user(db_conn, 5)["password_hash"])

    @pytest.mark.parametrize("password", ["abcdefg1", "Aa1" + "x" * 69, "Pässwörd1" * 6 + "1"])
    def test_accepts_passwords_within_the_policy(self, api, tokens, password):
        assert len(password.encode("utf-8")) <= 72
        assert api.post("/users", token=tokens["admin"], body={**BODY, "password": password}).status == 201
        assert login(api, "jane@acme.com", password).status == 200

    @pytest.mark.parametrize(
        "field, value", [("full_name", "J"), ("full_name", "n" * 120), ("email", "a" * 243 + "@example.com")]
    )
    def test_accepts_boundary_lengths(self, api, tokens, field, value):
        result = api.post("/users", token=tokens["admin"], body={**BODY, field: value})
        assert result.status == 201 and result.body[field] == value

    @pytest.mark.parametrize("field", ["email", "full_name", "role", "password"])
    def test_required_fields(self, api, tokens, db_conn, field):
        body = {key: value for key, value in BODY.items() if key != field}
        error = assert_error(api.post("/users", token=tokens["admin"], body=body), 400, "VALIDATION_ERROR", field)
        assert error["details"][field] == "This field is required"
        assert count_users(db_conn) == 4

    @pytest.mark.parametrize(
        "field, value, message",
        [
            ("email", "not-an-email", "Must be a valid email address"),
            ("email", "jane@acme", "Must be a valid email address"),
            ("email", "a" * 244 + "@example.com", None),
            ("email", 42, "Must be text"),
            ("full_name", "   ", "This field is required"),
            ("full_name", "x" * 121, None),
            ("full_name", 42, "Must be text"),
            ("role", "superuser", None),
            ("role", "Admin", None),
            ("role", 1, None),
            ("password", "Short1", "Must be at least 8 characters"),
            ("password", "abcdef1", "Must be at least 8 characters"),  # 7 characters: one short
            ("password", "lettersonly", "Must contain at least one letter and one number"),
            ("password", "12345678", "Must contain at least one letter and one number"),
            ("password", "Aa1" + "x" * 70, "Must be at most 72 bytes"),  # 73 bytes: one over
            ("password", "a1" * 37, "Must be at most 72 bytes"),
            ("password", "é1" * 25, "Must be at most 72 bytes"),  # 50 characters but 75 bytes
            ("password", 12345678, "Must be text"),
            ("is_active", "maybe", "Must be true or false"),
            ("is_active", None, "Must be true or false"),
        ],
    )
    def test_invalid_values_are_rejected_per_field(self, api, tokens, db_conn, field, value, message):
        error = assert_error(
            api.post("/users", token=tokens["admin"], body={**BODY, field: value}), 400, "VALIDATION_ERROR", field
        )
        if message:
            assert error["details"][field] == message
        assert count_users(db_conn) == 4

    def test_duplicate_email_is_a_conflict_regardless_of_case(self, api, tokens, db_conn):
        result = api.post("/users", token=tokens["admin"], body={**BODY, "email": " MANAGER@Acme.com"})
        error = assert_error(result, 409, "CONFLICT", "email")
        assert error["details"]["email"] == "A user with this email already exists"
        assert count_users(db_conn) == 4

    def test_malformed_json(self, api, tokens):
        assert_error(api.post("/users", token=tokens["admin"], raw_body="{oops"), 400, "INVALID_JSON")

    @pytest.mark.parametrize("raw_body", [None, "[1, 2]", '"text"'])
    def test_body_must_be_a_json_object(self, api, tokens, raw_body):
        assert_error(api.post("/users", token=tokens["admin"], raw_body=raw_body), 400, "VALIDATION_ERROR", "body")


class TestListUsers:
    def test_lists_seeded_accounts_sorted_by_full_name(self, api, tokens):
        result = api.get("/users", token=tokens["admin"])
        assert result.status == 200
        assert names(result) == SEEDED_NAMES and result.body["total"] == 4
        assert all(set(item) == USER_FIELDS for item in result.body["items"])
        assert "password" not in result.raw

    def test_sort_ignores_case(self, api, tokens, db_conn):
        add_user(db_conn, "aaron@acme.com", "aaron smith")
        add_user(db_conn, "zed@acme.com", "Zed Quinn")
        assert names(api.get("/users", token=tokens["admin"])) == ["aaron smith", *SEEDED_NAMES, "Zed Quinn"]

    @pytest.mark.parametrize(
        "term, expected",
        [
            ("JANE", ["Jane Doe"]),  # name, case-insensitive
            ("globex", ["Omar Haddad"]),  # email
            ("administrator", ["System Administrator"]),
            ("contributor", ["Team Contributor"]),  # role is not searched (Jane is a contributor)
            ("nobody", []),
        ],
    )
    def test_search_matches_name_or_email(self, api, tokens, db_conn, term, expected):
        add_user(db_conn, "jane@acme.com", "Jane Doe", "contributor")
        add_user(db_conn, "omar@globex.com", "Omar Haddad", "viewer")
        result = api.get("/users", token=tokens["admin"], query={"search": term})
        assert names(result) == expected and result.body["total"] == len(expected)

    def test_search_treats_like_wildcards_literally(self, api, tokens, db_conn):
        add_user(db_conn, "ann_lee@acme.com", "Ann Lee")
        add_user(db_conn, "annxlee@acme.com", "Ann X")
        assert names(api.get("/users", token=tokens["admin"], query={"search": "ann_"})) == ["Ann Lee"]
        assert names(api.get("/users", token=tokens["admin"], query={"search": "%"})) == []

    def test_role_filter(self, api, tokens, db_conn):
        add_user(db_conn, "root@acme.com", "Another Admin", "admin")
        result = api.get("/users", token=tokens["admin"], query={"role": "admin"})
        assert names(result) == ["Another Admin", "System Administrator"] and result.body["total"] == 2

    def test_is_active_filter(self, api, tokens, db_conn):
        add_user(db_conn, "jane@acme.com", "Jane Doe", is_active=False)
        assert names(api.get("/users", token=tokens["admin"], query={"is_active": False})) == ["Jane Doe"]
        assert names(api.get("/users", token=tokens["admin"], query={"is_active": True})) == SEEDED_NAMES

    def test_filters_combine(self, api, tokens, db_conn):
        add_user(db_conn, "jane@acme.com", "Jane Doe", "viewer", is_active=False)
        add_user(db_conn, "jack@acme.com", "Jack Doe", "viewer")
        add_user(db_conn, "joan@acme.com", "Joan Doe", "manager", is_active=False)
        query = {"search": "doe", "role": "viewer", "is_active": "false"}
        assert names(api.get("/users", token=tokens["admin"], query=query)) == ["Jane Doe"]

    @pytest.mark.parametrize("name, value", [("role", "superuser"), ("is_active", "maybe"), ("search", "x" * 201)])
    def test_invalid_filters(self, api, tokens, name, value):
        assert_error(api.get("/users", token=tokens["admin"], query={name: value}), 400, "VALIDATION_ERROR", name)


class TestGetUser:
    def test_returns_the_user_without_password(self, api, tokens):
        result = api.get("/users/2", token=tokens["admin"])
        assert result.status == 200 and set(result.body) == USER_FIELDS
        expected = {
            "id": 2,
            "email": "manager@acme.com",
            "full_name": "Project Manager",
            "role": "manager",
            "is_active": True,
        }
        assert {key: result.body[key] for key in expected} == expected

    def test_unknown_user_is_404(self, api, tokens):
        assert_error(api.get("/users/999", token=tokens["admin"]), 404, "NOT_FOUND")

    @pytest.mark.parametrize("method", ["GET", "PUT", "DELETE"])
    @pytest.mark.parametrize("user_id", ["abc", "0", "2147483648"])
    def test_invalid_id_in_the_url_is_400(self, api, tokens, method, user_id):
        result = api.request(method, f"/users/{user_id}", token=tokens["admin"], body=UPDATE_BODY)
        assert_error(result, 400, "VALIDATION_ERROR", "id")


class TestUpdateUser:
    def test_full_update_is_persisted(self, api, tokens, db_conn):
        jane = add_user(db_conn)
        db_conn.execute("UPDATE users SET created_at = %s, updated_at = %s WHERE id = %s", (PAST, PAST, jane))
        body = {"email": " Jane.Doe@ACME.com ", "full_name": " Jane Q. Doe ", "role": "viewer", "is_active": False}
        result = api.put(f"/users/{jane}", token=tokens["admin"], body=body)
        expected = {
            "id": jane,
            "email": "jane.doe@acme.com",
            "full_name": "Jane Q. Doe",
            "role": "viewer",
            "is_active": False,
        }
        assert result.status == 200 and set(result.body) == USER_FIELDS
        assert {key: result.body[key] for key in expected} == expected
        stored = stored_user(db_conn, jane)
        assert {key: stored[key] for key in ("email", "full_name", "role", "is_active")} == {
            key: expected[key] for key in ("email", "full_name", "role", "is_active")
        }
        assert stored["created_at"] == PAST and stored["updated_at"] > PAST

    @pytest.mark.parametrize("extra", [{}, {"password": None}])
    def test_password_is_kept_when_not_sent(self, api, tokens, db_conn, extra):
        jane = add_user(db_conn)
        hash_before = stored_user(db_conn, jane)["password_hash"]
        result = api.put(f"/users/{jane}", token=tokens["admin"], body={**UPDATE_BODY, "full_name": "Jane", **extra})
        assert result.status == 200 and result.body["full_name"] == "Jane"
        assert stored_user(db_conn, jane)["password_hash"] == hash_before
        assert login(api, "jane@acme.com", PASSWORD).status == 200

    def test_password_change_replaces_the_old_password(self, api, tokens, db_conn):
        jane = add_user(db_conn)
        result = api.put(f"/users/{jane}", token=tokens["admin"], body={**UPDATE_BODY, "password": "Rotated2027"})
        assert result.status == 200 and "Rotated2027" not in result.raw
        assert_error(login(api, "jane@acme.com", PASSWORD), 401, "INVALID_CREDENTIALS")
        assert login(api, "jane@acme.com", "Rotated2027").status == 200

    @pytest.mark.parametrize("password", ["", "short1", "no-digits-here", "a1" * 37])
    def test_new_password_must_follow_the_policy(self, api, tokens, db_conn, password):
        jane = add_user(db_conn)
        result = api.put(f"/users/{jane}", token=tokens["admin"], body={**UPDATE_BODY, "password": password})
        assert_error(result, 400, "VALIDATION_ERROR", "password")
        assert login(api, "jane@acme.com", PASSWORD).status == 200

    def test_put_is_a_full_update(self, api, tokens, db_conn):
        jane = add_user(db_conn)
        result = api.put(f"/users/{jane}", token=tokens["admin"], body={"full_name": "Jane"})
        error = assert_error(result, 400, "VALIDATION_ERROR")
        assert set(error["details"]) == {"email", "role", "is_active"}

    @pytest.mark.parametrize(
        "field, value, message",
        [
            ("email", "not-an-email", "Must be a valid email address"),
            ("email", None, "Must be text"),
            ("full_name", "   ", "This field is required"),
            ("full_name", "x" * 121, None),
            ("role", "superuser", None),
            ("is_active", None, "Must be true or false"),
            ("is_active", "maybe", "Must be true or false"),
        ],
    )
    def test_invalid_values_are_rejected_per_field(self, api, tokens, db_conn, field, value, message):
        jane = add_user(db_conn)
        result = api.put(f"/users/{jane}", token=tokens["admin"], body={**UPDATE_BODY, field: value})
        error = assert_error(result, 400, "VALIDATION_ERROR", field)
        if message:
            assert error["details"][field] == message
        assert stored_user(db_conn, jane)["full_name"] == "Jane Doe"

    @pytest.mark.parametrize("raw_body", [None, "[1, 2]", '"text"'])
    def test_body_must_be_a_json_object(self, api, tokens, db_conn, raw_body):
        jane = add_user(db_conn)
        result = api.put(f"/users/{jane}", token=tokens["admin"], raw_body=raw_body)
        assert_error(result, 400, "VALIDATION_ERROR", "body")

    def test_email_of_another_user_is_a_conflict(self, api, tokens, db_conn):
        jane = add_user(db_conn)
        result = api.put(f"/users/{jane}", token=tokens["admin"], body={**UPDATE_BODY, "email": "Viewer@ACME.com"})
        assert_error(result, 409, "CONFLICT", "email")
        assert stored_user(db_conn, jane)["email"] == "jane@acme.com"

    def test_keeping_own_email_in_another_case_is_allowed(self, api, tokens, db_conn):
        jane = add_user(db_conn)
        result = api.put(f"/users/{jane}", token=tokens["admin"], body={**UPDATE_BODY, "email": "JANE@ACME.COM"})
        assert result.status == 200 and result.body["email"] == "jane@acme.com"

    def test_unknown_user_is_404(self, api, tokens):
        assert_error(api.put("/users/999", token=tokens["admin"], body=UPDATE_BODY), 404, "NOT_FOUND")

    def test_user_deleted_by_another_request_meanwhile_is_404(self, api, tokens, db_conn, monkeypatch):
        jane = add_user(db_conn)
        real_update = users_repository.update_user

        def deleted_before_the_update(conn, user_id, values):
            conn.execute("DELETE FROM users WHERE id = %s", (user_id,))  # lands after the existence check
            return real_update(conn, user_id, values)

        monkeypatch.setattr(users_repository, "update_user", deleted_before_the_update)
        assert_error(api.put(f"/users/{jane}", token=tokens["admin"], body=UPDATE_BODY), 404, "NOT_FOUND")

    def test_malformed_json(self, api, tokens, db_conn):
        jane = add_user(db_conn)
        assert_error(api.put(f"/users/{jane}", token=tokens["admin"], raw_body="{"), 400, "INVALID_JSON")

    def test_role_change_applies_to_the_users_next_request(self, api, tokens):
        body = {"email": "manager@acme.com", "full_name": "Project Manager", "role": "viewer", "is_active": True}
        assert api.put("/users/2", token=tokens["admin"], body=body).status == 200
        assert api.get("/auth/me", token=tokens["manager"]).body["role"] == "viewer"

    def test_deactivated_user_is_logged_out(self, api, tokens):
        body = {"email": "viewer@acme.com", "full_name": "Read-only Viewer", "role": "viewer", "is_active": False}
        assert api.put("/users/4", token=tokens["admin"], body=body).status == 200
        assert_error(api.get("/auth/me", token=tokens["viewer"]), 401, "ACCOUNT_DISABLED")
        assert_error(login(api, "viewer@acme.com", "Viewer@123"), 403, "ACCOUNT_DISABLED")


class TestAdminSelfProtection:
    @pytest.mark.parametrize("role", ["manager", "contributor", "viewer"])
    def test_admin_cannot_change_their_own_role(self, api, tokens, db_conn, role):
        result = api.put(f"/users/{ADMIN_ID}", token=tokens["admin"], body={**ADMIN_BODY, "role": role})
        error = assert_error(result, 400, "INVALID_OPERATION", "role")
        assert error["message"] == "You cannot change your own role"
        assert stored_user(db_conn, ADMIN_ID)["role"] == "admin"

    def test_admin_cannot_deactivate_themselves(self, api, tokens, db_conn):
        result = api.put(f"/users/{ADMIN_ID}", token=tokens["admin"], body={**ADMIN_BODY, "is_active": False})
        error = assert_error(result, 400, "INVALID_OPERATION", "is_active")
        assert error["message"] == "You cannot deactivate your own account"
        assert stored_user(db_conn, ADMIN_ID)["is_active"] is True

    def test_admin_can_edit_their_own_profile_and_password(self, api, tokens):
        body = {**ADMIN_BODY, "email": "root@acme.com", "full_name": "Root", "password": "Rotated2027"}
        result = api.put(f"/users/{ADMIN_ID}", token=tokens["admin"], body=body)
        assert result.status == 200 and (result.body["email"], result.body["role"]) == ("root@acme.com", "admin")
        assert login(api, "root@acme.com", "Rotated2027").status == 200

    def test_admin_can_demote_and_deactivate_another_admin(self, api, tokens, db_conn):
        other = add_user(db_conn, "root@acme.com", "Second Admin", "admin")
        body = {"email": "root@acme.com", "full_name": "Second Admin", "role": "viewer", "is_active": False}
        result = api.put(f"/users/{other}", token=tokens["admin"], body=body)
        assert result.status == 200 and (result.body["role"], result.body["is_active"]) == ("viewer", False)

    def test_admin_cannot_delete_themselves(self, api, tokens, db_conn):
        error = assert_error(api.delete(f"/users/{ADMIN_ID}", token=tokens["admin"]), 400, "INVALID_OPERATION")
        assert error["message"] == "You cannot delete your own account"
        assert stored_user(db_conn, ADMIN_ID) is not None


class TestDeleteUser:
    def test_deletes_the_account(self, api, tokens, db_conn):
        jane = add_user(db_conn)
        result = api.delete(f"/users/{jane}", token=tokens["admin"])
        assert result.status == 204 and result.raw == ""
        assert stored_user(db_conn, jane) is None and count_users(db_conn) == 4
        assert_error(api.get(f"/users/{jane}", token=tokens["admin"]), 404, "NOT_FOUND")
        assert_error(login(api, "jane@acme.com", PASSWORD), 401, "INVALID_CREDENTIALS")

    def test_deleted_users_token_stops_working(self, api, tokens):
        assert api.delete("/users/4", token=tokens["admin"]).status == 204
        assert_error(api.get("/auth/me", token=tokens["viewer"]), 401, "INVALID_TOKEN")

    def test_unknown_user_is_404(self, api, tokens):
        assert_error(api.delete("/users/999", token=tokens["admin"]), 404, "NOT_FOUND")


# RBAC: action -> (method, path, permission, status when allowed)
ACTIONS = {
    "list": ("GET", "/users", "users:read", 200),
    "get": ("GET", "/users/{id}", "users:read", 200),
    "create": ("POST", "/users", "users:create", 201),
    "update": ("PUT", "/users/{id}", "users:update", 200),
    "delete": ("DELETE", "/users/{id}", "users:delete", 204),
}
TARGET = {"email": "target@acme.com", "full_name": "Target User", "role": "viewer"}


class TestPermissions:
    def _call(self, api, db_conn, action, token):
        target = add_user(db_conn, **TARGET)
        method, path, _, _ = ACTIONS[action]
        body = {"POST": BODY, "PUT": {**TARGET, "full_name": "Changed", "is_active": True}}.get(method)
        return api.request(method, path.format(id=target), token=token, body=body)

    @pytest.mark.parametrize("action", list(ACTIONS))
    def test_requires_authentication(self, api, db_conn, action):
        assert_error(self._call(api, db_conn, action, None), 401, "AUTH_REQUIRED")

    @pytest.mark.parametrize("action", list(ACTIONS))
    def test_admin_is_allowed(self, api, tokens, db_conn, action):
        result = self._call(api, db_conn, action, tokens["admin"])
        assert result.status == ACTIONS[action][3], result.body

    @pytest.mark.parametrize("role, action", [(role, action) for role in NON_ADMIN_ROLES for action in ACTIONS])
    def test_other_roles_are_forbidden(self, api, tokens, db_conn, role, action):
        result = self._call(api, db_conn, action, tokens[role])
        error = assert_error(result, 403, "FORBIDDEN")
        assert error["details"]["required_permission"] == ACTIONS[action][2]
        stored = db_conn.execute("SELECT email, full_name FROM users WHERE id > 4").fetchall()
        assert stored == [{"email": "target@acme.com", "full_name": "Target User"}]  # nothing changed
