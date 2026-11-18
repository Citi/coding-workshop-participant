from datetime import datetime

from sqlalchemy import BigInteger, DateTime, FetchedValue, Identity, String, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.enums import UserRole, user_role_t


class User(Base):
    __tablename__ = "users"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    full_name: Mapped[str] = mapped_column(String(150))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(user_role_t, server_default=UserRole.EMPLOYEE.value)
    phone: Mapped[str | None] = mapped_column(String(30))
    department: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(server_default=true())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), server_onupdate=FetchedValue()
    )

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.FACILITY_ADMIN

    @property
    def is_engineer(self) -> bool:
        return self.role == UserRole.ENGINEER
