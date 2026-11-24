"""Runtime settings, read once from the environment variables Terraform injects."""

import os
from dataclasses import dataclass
from functools import lru_cache

# Only ever used when IS_LOCAL=true and Terraform did not provide JWT_SECRET.
LOCAL_DEV_JWT_SECRET = "local-development-only-jwt-secret-change-me"  # nosec B105 # public placeholder, local only


@dataclass(frozen=True)
class Settings:
    """Typed view of the environment configuration."""

    is_local: bool
    postgres_host: str
    postgres_port: int
    postgres_name: str
    postgres_user: str
    postgres_password: str
    jwt_secret: str
    access_token_minutes: int
    refresh_token_days: int
    bcrypt_rounds: int


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached settings (call ``get_settings.cache_clear()`` in tests to reload)."""
    is_local = os.getenv("IS_LOCAL", "false").strip().lower() == "true"
    jwt_secret = os.getenv("JWT_SECRET", "").strip()
    if not jwt_secret:
        if not is_local:
            raise RuntimeError("JWT_SECRET must be configured outside local development")
        jwt_secret = LOCAL_DEV_JWT_SECRET
    return Settings(
        is_local=is_local,
        postgres_host=os.getenv("POSTGRES_HOST") or "localhost",
        postgres_port=_env_int("POSTGRES_PORT", 5432),
        postgres_name=os.getenv("POSTGRES_NAME") or "postgres",
        postgres_user=os.getenv("POSTGRES_USER") or "postgres",
        postgres_password=os.getenv("POSTGRES_PASS", ""),
        jwt_secret=jwt_secret,
        access_token_minutes=_env_int("ACCESS_TOKEN_MINUTES", 30),
        refresh_token_days=_env_int("REFRESH_TOKEN_DAYS", 7),
        bcrypt_rounds=_env_int("BCRYPT_ROUNDS", 10),
    )
