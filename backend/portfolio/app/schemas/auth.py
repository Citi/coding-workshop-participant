"""Request and response models for registration, login and token refresh."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AfterValidator, StringConstraints

from app.schemas.common import RequestModel, ResponseModel
from app.schemas.departments import RecordId, reject_control_characters
from app.schemas.users import EMAIL_MAX_LENGTH, Email, Password, PersonName, UserOut


class RegisterRequest(RequestModel):
    """Body of ``POST /auth/register``.

    There is deliberately no ``role`` field: sending one is rejected with 400
    (``extra="forbid"``), and every self-registered account is a VIEWER.
    """

    name: PersonName
    email: Email
    password: Password
    department_id: RecordId | None = None


class LoginRequest(RequestModel):
    """Body of ``POST /auth/login``.

    The email's format is not checked, so any wrong email/password pair gets the
    same 401, whatever its shape. Only presence, size and control characters are
    checked (400): no account can have such an email, because registration and
    ``PUT /users`` refuse them, and NUL would make the database lookup fail.
    The password is never trimmed and never reaches SQL, so any text is allowed.
    """

    email: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=EMAIL_MAX_LENGTH),
        AfterValidator(reject_control_characters),
        AfterValidator(str.lower),
    ]
    password: Annotated[
        str, StringConstraints(strip_whitespace=False, min_length=1, max_length=1024)
    ]


class RefreshRequest(RequestModel):
    """Body of ``POST /auth/refresh``: the refresh token returned by login."""

    refresh_token: Annotated[str, StringConstraints(min_length=1, max_length=4096)]


class LoginResponse(ResponseModel):
    """Tokens plus the signed-in user, returned by ``POST /auth/login``."""

    access_token: str
    refresh_token: str
    token_type: Literal["bearer"]
    expires_in: int
    user: UserOut


class RefreshResponse(ResponseModel):
    """A new access token, returned by ``POST /auth/refresh``."""

    access_token: str
    token_type: Literal["bearer"]
    expires_in: int
