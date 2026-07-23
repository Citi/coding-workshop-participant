"""
Unit tests for the auth service.

The service layer is monkeypatched throughout, so these run without a database
and cover the logic that actually decides things: credential checking, token
handling, RBAC, validation and routing. Database-backed behaviour is covered by
the integration tests run against local Postgres.

    cd backend/auth && python -m pytest test_auth.py -v
"""

import json
from datetime import datetime, timedelta, timezone

import jwt
import pytest

import models
import routes
import service
from _shared import auth as shared_auth
from _shared.router import Router
from _shared.validation import ValidationError, validate

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

USER = {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "ada@acme.test",
    "full_name": "Ada Sanders",
    "role": "PROJECT_MANAGER",
    "is_active": True,
    "password_hash": shared_auth.hash_password("correct-horse"),
}


def make_event(method="GET", path="/", body=None, token=None, query=None):
    event = {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "headers": {},
        "queryStringParameters": query,
    }
    if body is not None:
        event["body"] = json.dumps(body)
    if token:
        event["headers"]["authorization"] = f"Bearer {token}"
    return event


def body_of(response):
    return json.loads(response["body"])


# --------------------------------------------------------------------------
# Password hashing
# --------------------------------------------------------------------------


def test_password_roundtrip():
    hashed = shared_auth.hash_password("s3cret-passphrase")
    assert hashed != "s3cret-passphrase"
    assert shared_auth.verify_password("s3cret-passphrase", hashed)


def test_password_rejects_wrong_value():
    hashed = shared_auth.hash_password("s3cret-passphrase")
    assert not shared_auth.verify_password("wrong", hashed)


def test_password_rejects_malformed_hash():
    # A corrupt or truncated column value must be a failed login, not a crash.
    assert not shared_auth.verify_password("anything", "not-a-bcrypt-hash")


def test_hashes_are_salted():
    assert shared_auth.hash_password("same") != shared_auth.hash_password("same")


# --------------------------------------------------------------------------
# Tokens
# --------------------------------------------------------------------------


def test_access_token_roundtrip():
    token = shared_auth.create_access_token(USER)
    claims = shared_auth.decode_token(token, expected_type="access")

    assert claims["sub"] == USER["id"]
    assert claims["email"] == USER["email"]
    assert claims["role"] == "PROJECT_MANAGER"


def test_refresh_token_is_not_accepted_as_access():
    # Otherwise a 7-day refresh token would grant 7 days of API access.
    token = shared_auth.create_refresh_token(USER)
    with pytest.raises(shared_auth.AuthError):
        shared_auth.decode_token(token, expected_type="access")


def test_expired_token_is_rejected():
    expired = jwt.encode(
        {
            "sub": USER["id"],
            "email": USER["email"],
            "role": USER["role"],
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
        },
        shared_auth._secret(),
        algorithm=shared_auth.ALGORITHM,
    )
    with pytest.raises(shared_auth.AuthError, match="expired"):
        shared_auth.decode_token(expired)


def test_tampered_token_is_rejected():
    token = shared_auth.create_access_token(USER)
    forged = jwt.encode({**shared_auth.decode_token(token), "role": "ADMIN"}, "wrong-key")
    with pytest.raises(shared_auth.AuthError):
        shared_auth.decode_token(forged)


def test_bearer_header_parsing():
    token = shared_auth.create_access_token(USER)
    assert shared_auth.bearer_token(make_event(token=token)) == token


@pytest.mark.parametrize("header", ["", "Token abc", "Bearer", "Bearer a b"])
def test_malformed_authorization_header(header):
    event = make_event()
    event["headers"]["authorization"] = header
    with pytest.raises(shared_auth.AuthError):
        shared_auth.bearer_token(event)


# --------------------------------------------------------------------------
# RBAC
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "role,action,allowed",
    [
        ("ADMIN", "delete_projects", True),
        ("ADMIN", "manage_users", True),
        ("PROJECT_MANAGER", "delete_projects", True),
        ("PROJECT_MANAGER", "manage_users", False),
        ("TEAM_LEADER", "create_projects", False),
        ("TEAM_LEADER", "manage_deliverables", True),
        ("TEAM_LEADER", "manage_budgets", False),
        ("TEAM_LEADER", "view_budgets", True),
        ("EMPLOYEE", "update_deliverables", True),
        ("EMPLOYEE", "manage_deliverables", False),
        ("EMPLOYEE", "view_budgets", False),
        ("STAKEHOLDER", "view_projects", True),
        ("STAKEHOLDER", "create_projects", False),
        ("STAKEHOLDER", "generate_reports", True),
    ],
)
def test_permission_matrix(role, action, allowed):
    claims = {"role": role}
    if allowed:
        assert shared_auth.require_permission(claims, action)
    else:
        with pytest.raises(shared_auth.AuthError) as exc:
            shared_auth.require_permission(claims, action)
        assert exc.value.status == 403


def test_unknown_role_is_denied():
    # Fail closed: a role this table has not been taught about gets nothing.
    with pytest.raises(shared_auth.AuthError):
        shared_auth.require_permission({"role": "SuperUser"}, "view_projects")


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------


def test_register_spec_accepts_valid_input():
    clean = validate(
        {"email": "New.User@ACME.test", "password": "long-enough", "fullName": " Ada "},
        models.REGISTER_SPEC,
    )
    assert clean["email"] == "new.user@acme.test"  # lowercased
    assert clean["fullName"] == "Ada"  # trimmed


def test_register_spec_reports_every_problem_at_once():
    with pytest.raises(ValidationError) as exc:
        validate({"email": "nope", "password": "short"}, models.REGISTER_SPEC)

    errors = exc.value.field_errors
    assert "email" in errors
    assert "password" in errors
    assert "fullName" in errors


def test_partial_validation_skips_absent_fields():
    clean = validate({"fullName": "Ada Sanders"}, models.UPDATE_USER_SPEC, partial=True)
    assert clean == {"fullName": "Ada Sanders"}


def test_enum_rejects_unknown_role():
    with pytest.raises(ValidationError) as exc:
        validate({"role": "Overlord"}, models.UPDATE_ROLE_SPEC)
    assert "role" in exc.value.field_errors


# --------------------------------------------------------------------------
# Routing
# --------------------------------------------------------------------------


def test_router_normalises_both_path_forms():
    """Local proxy sends /login; CloudFront sends /api/auth/login."""
    router = Router("auth")
    router.add("POST", "/login", lambda event: {"statusCode": 200})

    assert router.dispatch(make_event("POST", "/login"))["statusCode"] == 200
    assert router.dispatch(make_event("POST", "/api/auth/login"))["statusCode"] == 200


def test_router_extracts_path_parameters():
    router = Router("auth")
    router.add("GET", "/users/{id}", lambda event, id: {"statusCode": 200, "body": id})

    assert router.dispatch(make_event("GET", "/users/abc-123"))["body"] == "abc-123"


def test_router_returns_404_for_unknown_path():
    router = Router("auth")
    assert router.dispatch(make_event("GET", "/nope"))["statusCode"] == 404


def test_router_returns_405_for_wrong_method():
    router = Router("auth")
    router.add("POST", "/login", lambda event: {"statusCode": 200})
    assert router.dispatch(make_event("GET", "/login"))["statusCode"] == 405


def test_router_answers_options_preflight():
    assert Router("auth").dispatch(make_event("OPTIONS", "/login"))["statusCode"] == 204


def test_router_converts_validation_error_to_400():
    def boom(event):
        raise ValidationError({"email": "bad"}, "Validation failed")

    router = Router("auth")
    router.add("POST", "/login", boom)

    result = router.dispatch(make_event("POST", "/login"))
    assert result["statusCode"] == 400
    assert body_of(result)["fieldErrors"] == {"email": "bad"}


def test_router_hides_internal_errors():
    def boom(event):
        raise RuntimeError("connection string user=admin password=hunter2")

    router = Router("auth")
    router.add("GET", "/boom", boom)

    result = router.dispatch(make_event("GET", "/boom"))
    assert result["statusCode"] == 500
    assert "hunter2" not in result["body"]


# --------------------------------------------------------------------------
# Login
# --------------------------------------------------------------------------


def test_login_returns_tokens(monkeypatch):
    monkeypatch.setattr(service, "find_by_email", lambda email: USER)

    result = routes.login(make_event("POST", "/login", {"email": USER["email"], "password": "correct-horse"}))
    payload = body_of(result)

    assert result["statusCode"] == 200
    assert payload["user"]["email"] == USER["email"]
    assert "password_hash" not in json.dumps(payload)  # never leaks
    assert shared_auth.decode_token(payload["accessToken"])["role"] == "PROJECT_MANAGER"


def test_login_rejects_wrong_password(monkeypatch):
    monkeypatch.setattr(service, "find_by_email", lambda email: USER)

    with pytest.raises(shared_auth.AuthError) as exc:
        routes.login(make_event("POST", "/login", {"email": USER["email"], "password": "nope"}))
    assert exc.value.status == 401


def test_login_gives_same_error_for_unknown_email(monkeypatch):
    """Unknown address and wrong password must be indistinguishable."""
    monkeypatch.setattr(service, "find_by_email", lambda email: None)

    with pytest.raises(shared_auth.AuthError) as unknown:
        routes.login(make_event("POST", "/login", {"email": "ghost@acme.test", "password": "whatever"}))

    monkeypatch.setattr(service, "find_by_email", lambda email: USER)
    with pytest.raises(shared_auth.AuthError) as wrong:
        routes.login(make_event("POST", "/login", {"email": USER["email"], "password": "nope"}))

    assert unknown.value.message == wrong.value.message


def test_login_rejects_deactivated_account(monkeypatch):
    monkeypatch.setattr(service, "find_by_email", lambda email: {**USER, "is_active": False})

    with pytest.raises(shared_auth.AuthError) as exc:
        routes.login(make_event("POST", "/login", {"email": USER["email"], "password": "correct-horse"}))
    assert exc.value.status == 403


# --------------------------------------------------------------------------
# Registration
# --------------------------------------------------------------------------


def test_first_registration_becomes_admin(monkeypatch):
    granted = {}

    monkeypatch.setattr(service, "find_by_email", lambda email: None)
    monkeypatch.setattr(service, "count_users", lambda: 0)
    monkeypatch.setattr(
        service,
        "create_user",
        lambda **kwargs: granted.update(kwargs) or {"id": USER["id"]},
    )
    monkeypatch.setattr(service, "find_by_id", lambda uid: {**USER, "role": granted["role"]})

    result = routes.register(
        make_event("POST", "/register", {"email": "first@acme.test", "password": "long-enough", "fullName": "First"})
    )

    assert result["statusCode"] == 201
    assert granted["role"] == "ADMIN"


def test_later_registration_uses_the_email_rule(monkeypatch):
    granted = {}

    monkeypatch.setattr(service, "find_by_email", lambda email: None)
    monkeypatch.setattr(service, "count_users", lambda: 7)
    monkeypatch.setattr(
        service,
        "create_user",
        lambda **kwargs: granted.update(kwargs) or {"id": USER["id"]},
    )
    monkeypatch.setattr(service, "find_by_id", lambda uid: {**USER, "role": granted["role"]})

    routes.register(
        make_event("POST", "/register", {"email": "later@gmail.com", "password": "long-enough", "fullName": "Later"})
    )

    # A non-corporate address gets read-only access, never user management.
    assert granted["role"] == "STAKEHOLDER"


def test_registration_rejects_duplicate_email(monkeypatch):
    monkeypatch.setattr(service, "find_by_email", lambda email: USER)

    with pytest.raises(ValidationError) as exc:
        routes.register(
            make_event("POST", "/register", {"email": USER["email"], "password": "long-enough", "fullName": "Dup"})
        )
    assert "email" in exc.value.field_errors


# --------------------------------------------------------------------------
# Refresh
# --------------------------------------------------------------------------


def test_refresh_reflects_a_role_change(monkeypatch):
    """A demoted user must lose access on refresh, not when the token expires."""
    token = shared_auth.create_refresh_token(USER)  # issued as Manager
    monkeypatch.setattr(service, "find_by_id", lambda uid: {**USER, "role": "STAKEHOLDER"})

    result = routes.refresh(make_event("POST", "/refresh", {"refreshToken": token}))
    payload = body_of(result)

    assert shared_auth.decode_token(payload["accessToken"])["role"] == "STAKEHOLDER"


def test_refresh_rejects_an_access_token(monkeypatch):
    token = shared_auth.create_access_token(USER)

    with pytest.raises(shared_auth.AuthError):
        routes.refresh(make_event("POST", "/refresh", {"refreshToken": token}))


def test_refresh_rejects_deactivated_account(monkeypatch):
    token = shared_auth.create_refresh_token(USER)
    monkeypatch.setattr(service, "find_by_id", lambda uid: {**USER, "is_active": False})

    with pytest.raises(shared_auth.AuthError) as exc:
        routes.refresh(make_event("POST", "/refresh", {"refreshToken": token}))
    assert exc.value.status == 403


# --------------------------------------------------------------------------
# User administration
# --------------------------------------------------------------------------


def test_non_admin_cannot_list_users():
    token = shared_auth.create_access_token(USER)  # Manager

    with pytest.raises(shared_auth.AuthError) as exc:
        routes.list_users(make_event("GET", "/users", token=token))
    assert exc.value.status == 403


def test_admin_can_list_users(monkeypatch):
    admin = {**USER, "role": "ADMIN"}
    monkeypatch.setattr(service, "list_users", lambda search=None, role=None: [USER])

    result = routes.list_users(make_event("GET", "/users", token=shared_auth.create_access_token(admin)))

    assert result["statusCode"] == 200
    assert body_of(result)[0]["email"] == USER["email"]


def test_admin_cannot_delete_own_account(monkeypatch):
    admin = {**USER, "role": "ADMIN"}
    token = shared_auth.create_access_token(admin)

    with pytest.raises(shared_auth.AuthError) as exc:
        routes.delete_user(make_event("DELETE", f"/users/{admin['id']}", token=token), id=admin["id"])
    assert exc.value.status == 403


def test_cannot_demote_the_last_admin(monkeypatch):
    admin = {**USER, "role": "ADMIN"}
    monkeypatch.setattr(service, "find_by_id", lambda uid: admin)
    monkeypatch.setattr(service, "count_admins", lambda exclude_id=None: 0)

    token = shared_auth.create_access_token(admin)
    event = make_event("PATCH", f"/users/{admin['id']}/role", {"role": "STAKEHOLDER"}, token=token)

    with pytest.raises(shared_auth.AuthError, match="at least one active Admin"):
        routes.update_role(event, id=admin["id"])


def test_can_demote_an_admin_when_another_remains(monkeypatch):
    admin = {**USER, "role": "ADMIN"}
    monkeypatch.setattr(service, "find_by_id", lambda uid: admin)
    monkeypatch.setattr(service, "count_admins", lambda exclude_id=None: 1)
    monkeypatch.setattr(service, "update_user", lambda uid, **kwargs: {**admin, "role": "STAKEHOLDER"})

    token = shared_auth.create_access_token(admin)
    event = make_event("PATCH", f"/users/{admin['id']}/role", {"role": "STAKEHOLDER"}, token=token)

    assert routes.update_role(event, id=admin["id"])["statusCode"] == 200


# --------------------------------------------------------------------------
# Signup role derived from the email address
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "email,expected",
    [
        ("ada.admin@acme.com", "ADMIN"),
        ("ada.mr@acme.com", "PROJECT_MANAGER"),
        ("ada.tl@acme.com", "TEAM_LEADER"),
        ("ada@acme.com", "EMPLOYEE"),
        ("ada.smith@acme.com", "EMPLOYEE"),
        ("ada@gmail.com", "STAKEHOLDER"),
        # Unknown domains fall back to read-only rather than guessing.
        ("ada@example.org", "STAKEHOLDER"),
        ("", "STAKEHOLDER"),
    ],
)
def test_role_for_email(email, expected):
    assert models.role_for_email(email) == expected


def test_role_for_email_is_case_insensitive():
    assert models.role_for_email("Ada.MR@ACME.com") == "PROJECT_MANAGER"


@pytest.mark.parametrize("email", ["ada.mr@gmail.com", "ada.admin@gmail.com"])
def test_suffix_only_counts_on_the_corporate_domain(email):
    """A lookalike address elsewhere must earn nothing."""
    assert models.role_for_email(email) == "STAKEHOLDER"


def test_admin_suffix_grants_admin():
    """Deliberate: .admin@acme.com is the documented way to bootstrap an Admin."""
    assert models.role_for_email("ada.admin@acme.com") == "ADMIN"


def test_registration_grants_the_role_from_the_email(monkeypatch):
    granted = {}
    monkeypatch.setattr(service, "find_by_email", lambda email: None)
    monkeypatch.setattr(service, "count_users", lambda: 5)
    monkeypatch.setattr(service, "create_user",
                        lambda **kwargs: granted.update(kwargs) or {"id": USER["id"]})
    monkeypatch.setattr(service, "find_by_id", lambda uid: {**USER, "role": granted["role"]})

    routes.register(make_event("POST", "/register", {
        "email": "bo.tl@acme.com", "password": "long-enough", "fullName": "Bo"}))

    assert granted["role"] == "TEAM_LEADER"
