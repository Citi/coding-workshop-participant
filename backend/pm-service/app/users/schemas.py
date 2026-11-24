"""Request bodies for the users endpoints (admin only).

Passwords are never trimmed: they are checked against the password policy and hashed
exactly as typed, which is also how the login endpoint compares them.
"""

from typing import Annotated, Literal

from pydantic import AfterValidator

from app.auth.passwords import check_password_strength
from app.auth.permissions import ROLES
from app.core.validation import ApiModel, Email, Name120

UserRole = Literal[*ROLES]  # the role list is defined once, in app.auth.permissions
NewPassword = Annotated[str, AfterValidator(check_password_strength)]


class _UserFields(ApiModel):
    """Fields shared by POST and PUT."""

    email: Email
    full_name: Name120
    role: UserRole


class UserCreateRequest(_UserFields):
    """Body of POST /users."""

    password: NewPassword
    is_active: bool = True


class UserUpdateRequest(_UserFields):
    """Body of PUT /users/{id}: a full update, except ``password``, which is only sent to change it."""

    is_active: bool
    password: NewPassword | None = None
