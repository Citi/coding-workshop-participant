"""Request bodies for the authentication endpoints."""

from typing import Annotated

from pydantic import StringConstraints

from app.core.validation import ApiModel


class LoginRequest(ApiModel):
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
    # Passwords are never trimmed or policy-checked at login: compare exactly what was typed.
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class RefreshRequest(ApiModel):
    refresh_token: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4096)]
