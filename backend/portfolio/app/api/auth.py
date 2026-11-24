"""Authentication routes: register, login, refresh and the current user.

``/auth/register``, ``/auth/login`` and ``/auth/refresh`` are public; ``/auth/me``
needs an access token.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.models import User
from app.db.session import get_db
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RefreshResponse,
    RegisterRequest,
)
from app.schemas.users import UserOut
from app.security import (
    BEARER,
    access_token_lifetime_seconds,
    create_access_token,
    create_refresh_token,
    get_current_user,
    unauthenticated,
    user_from_refresh_token,
)
from app.services import users as users_service

router = APIRouter(prefix="/auth", tags=["auth"])

# One message for an unknown email and a wrong password, so neither is revealed.
INVALID_CREDENTIALS = "Invalid email or password."


@router.post("/register", status_code=201, response_model=UserOut)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> UserOut:
    """Create a VIEWER account. 409 if the email exists, 400 for a ``role`` field or bad input."""
    return UserOut.from_user(users_service.register_user(db, body))


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    """Exchange email and password for an access token, a refresh token and the user."""
    user = users_service.authenticate(db, body.email, body.password)
    if user is None:
        raise unauthenticated(INVALID_CREDENTIALS)
    return LoginResponse(
        access_token=create_access_token(user),
        refresh_token=create_refresh_token(user),
        token_type=BEARER,
        expires_in=access_token_lifetime_seconds(),
        user=UserOut.from_user(user),
    )


@router.post("/refresh", response_model=RefreshResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)) -> RefreshResponse:
    """Exchange a refresh token for a new access token carrying the user's current role."""
    user = user_from_refresh_token(db, body.refresh_token)
    return RefreshResponse(
        access_token=create_access_token(user),
        token_type=BEARER,
        expires_in=access_token_lifetime_seconds(),
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    """Return the signed-in user, as currently stored."""
    return UserOut.from_user(user)
