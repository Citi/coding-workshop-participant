"""User routes: every signed-in role can read; only ADMIN can create, change or delete users."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import PageParams, page_params
from app.db.models import User
from app.db.session import get_db
from app.schemas.common import Page
from app.schemas.departments import MAX_ID, SearchText
from app.schemas.users import Role, UserCreate, UserOut, UserUpdate
from app.security import get_current_user, require_roles
from app.services import users as service

router = APIRouter(prefix="/users", tags=["users"])

UserId = Annotated[int, Path(ge=1, le=MAX_ID, description="User id.")]

# Control characters (NUL above all, which PostgreSQL cannot compare) are a 400.
UserSearch = Annotated[
    SearchText | None,
    Query(max_length=255, description="Name or email contains (ignoring case)."),
]
RoleFilter = Annotated[Role | None, Query(description="Only users with this role.")]
DepartmentFilter = Annotated[
    int | None, Query(ge=1, le=MAX_ID, description="Only users in this department.")
]


@router.get("", response_model=Page[UserOut])
def list_users(
    q: UserSearch = None,
    role: RoleFilter = None,
    department_id: DepartmentFilter = None,
    page: PageParams = Depends(page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[UserOut]:
    """List users ordered by id: ``{items, total}``, filtered by q, role and department_id."""
    rows, total = service.list_users(
        db, q=q, role=role, department_id=department_id, limit=page.limit, offset=page.offset
    )
    return Page[UserOut](items=[UserOut.from_user(row) for row in rows], total=total)


@router.post("", status_code=201, response_model=UserOut)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("ADMIN")),
) -> UserOut:
    """Create a user with any role (ADMIN): 409 on a taken email, 400 on an unknown department."""
    return UserOut.from_user(service.create_user(db, actor=actor, data=body))


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: UserId,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> UserOut:
    """Return one user; 404 when they do not exist."""
    return UserOut.from_user(service.get_user(db, user_id))


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: UserId,
    body: UserUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("ADMIN")),
) -> UserOut:
    """Change any of name, email, role, department and password (ADMIN).

    An admin cannot change their own role (409). The new role applies to the
    user's very next request, because every request reloads the user.
    """
    return UserOut.from_user(service.update_user(db, actor=actor, user_id=user_id, data=body))


@router.delete("/{user_id}", status_code=204, response_class=Response)
def delete_user(
    user_id: UserId,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("ADMIN")),
) -> Response:
    """Delete a user (ADMIN): 204 with no body; an admin cannot delete themselves (409)."""
    service.delete_user(db, actor=actor, user_id=user_id)
    return Response(status_code=204)
