"""Application settings read from environment variables.

Terraform injects the database variables and ``JWT_SECRET`` into the Lambda.
Tests and local CLI runs set the same variables before importing the app.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


class ConfigError(RuntimeError):
    """Raised when a required setting is missing or has an invalid value."""


def _int_env(name: str, default: int) -> int:
    """Read an integer environment variable, falling back to ``default`` when unset."""
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer, got {raw!r}.") from exc


@dataclass(frozen=True)
class Settings:
    """Runtime configuration for the portfolio service."""

    is_local: bool
    postgres_host: str
    postgres_port: int
    postgres_name: str
    postgres_user: str
    postgres_pass: str
    postgres_schema: str | None
    jwt_secret: str
    bcrypt_rounds: int
    access_token_minutes: int
    refresh_token_hours: int

    def require_jwt_secret(self) -> str:
        """Return the JWT signing secret or fail fast with a clear message."""
        if not self.jwt_secret:
            raise ConfigError(
                "JWT_SECRET is not set. In AWS and LocalStack it comes from Terraform "
                "(random_password.jwt_secret); for local runs export JWT_SECRET first."
            )
        return self.jwt_secret


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Build the settings once per process from the current environment."""
    schema = os.getenv("POSTGRES_SCHEMA", "").strip() or None
    return Settings(
        is_local=os.getenv("IS_LOCAL", "false").strip().lower() == "true",
        postgres_host=os.getenv("POSTGRES_HOST", "localhost").strip() or "localhost",
        postgres_port=_int_env("POSTGRES_PORT", 5432),
        postgres_name=os.getenv("POSTGRES_NAME", "postgres").strip() or "postgres",
        postgres_user=os.getenv("POSTGRES_USER", "postgres").strip() or "postgres",
        postgres_pass=os.getenv("POSTGRES_PASS", ""),
        postgres_schema=schema,
        jwt_secret=os.getenv("JWT_SECRET", "").strip(),
        bcrypt_rounds=_int_env("BCRYPT_ROUNDS", 10),
        access_token_minutes=_int_env("ACCESS_TOKEN_MINUTES", 30),
        refresh_token_hours=_int_env("REFRESH_TOKEN_HOURS", 8),
    )
