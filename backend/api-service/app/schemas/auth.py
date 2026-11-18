import re

from pydantic import BaseModel, field_validator

from app.core import config
from app.models import User, UserRole

_ACME_EMAIL = re.compile(rf"^[^@\s]+@{re.escape(config.ACME_EMAIL_DOMAIN)}$")


class RegisterIn(BaseModel):
    name: str
    email: str
    password: str

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Please enter your full name.")
        if len(v) > 150:
            raise ValueError("Name is too long.")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _ACME_EMAIL.match(v):
            raise ValueError(f"Registration requires an @{config.ACME_EMAIL_DOMAIN} email address.")
        return v

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        if len(v) < config.MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {config.MIN_PASSWORD_LENGTH} characters.")
        if len(v.encode()) > 72:
            raise ValueError("Password must be at most 72 bytes.")
        return v


class LoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.strip().lower()


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: UserRole
    department: str | None = None

    @classmethod
    def from_user(cls, u: User) -> "UserOut":
        return cls(id=u.id, name=u.full_name, email=u.email, role=u.role, department=u.department)


class RegisterOut(BaseModel):
    user: UserOut


class LoginOut(BaseModel):
    token: str
    user: UserOut
