from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User, UserRole
from app.schemas.auth import LoginIn, LoginOut, RegisterIn, RegisterOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=RegisterOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, db: DbSession):
    """Employee self-registration (acme.inc emails only). Other roles are admin-managed."""
    user = User(
        full_name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
        role=UserRole.EMPLOYEE,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.") from exc
    return {"user": UserOut.from_user(user)}


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, db: DbSession):
    """Sign in any persona; returns a bearer token valid for 8 hours."""
    user = db.scalar(select(User).where(User.email == body.email))
    if not verify_password(body.password, user.password_hash if user else None) or user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your account is disabled. Contact your Facility Admin.")

    db.execute(update(User).where(User.id == user.id).values(last_login_at=func.now()))
    db.commit()
    return {"token": create_access_token(user.id, user.role), "user": UserOut.from_user(user)}


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    """The signed-in user (useful to validate a stored token)."""
    return UserOut.from_user(user)
