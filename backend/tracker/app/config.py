"""
Runtime configuration loaded from environment variables.

The workshop Terraform injects POSTGRES_* and IS_LOCAL into every Lambda.
Everything else has a safe default so no infrastructure changes are needed.
"""

import hashlib
import os

from psycopg.conninfo import make_conninfo

IS_LOCAL: bool = os.getenv("IS_LOCAL", "false") == "true"

# Path prefix that CloudFront forwards to this Lambda (/api/<service-name>).
SERVICE_NAME: str = "tracker"
PATH_PREFIX: str = f"/api/{SERVICE_NAME}"

HOURS_PER_DAY: int = 8  # Business assumption: each employee works 8h per weekday.


def postgres_dsn() -> str:
    """Build the libpq connection string, enabling SSL for AWS Aurora.

    ``make_conninfo`` quotes every value, so empty or special-character
    passwords cannot corrupt the connection string.
    """
    params = {
        "host": os.getenv("POSTGRES_HOST", "localhost"),
        "port": os.getenv("POSTGRES_PORT", "5432"),
        "user": os.getenv("POSTGRES_USER", "postgres"),
        "password": os.getenv("POSTGRES_PASS", "postgres123"),
        "dbname": os.getenv("POSTGRES_NAME", "postgres"),
        "connect_timeout": 15,
    }
    if not IS_LOCAL:
        params["sslmode"] = "require"
    return make_conninfo(**params)


def jwt_secret() -> str:
    """
    Return the JWT signing secret.

    Uses JWT_SECRET when set; otherwise derives a stable secret from the
    per-deployment database password and app id, which Terraform generates
    randomly in AWS, so no extra secret has to be provisioned.
    """
    explicit = os.getenv("JWT_SECRET", "")
    if explicit:
        return explicit
    seed = f"{os.getenv('APP_ID', 'local')}:{os.getenv('POSTGRES_PASS', 'postgres123')}"
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


ACCESS_TOKEN_MINUTES: int = int(os.getenv("ACCESS_TOKEN_MINUTES", "60"))
REFRESH_TOKEN_DAYS: int = int(os.getenv("REFRESH_TOKEN_DAYS", "7"))

# Seed data: first admin account and optional demo records.
SEED_ADMIN_USERNAME: str = os.getenv("SEED_ADMIN_USERNAME", "admin")
SEED_ADMIN_PASSWORD: str = os.getenv("SEED_ADMIN_PASSWORD", "Admin123!")  # nosec B105
SEED_DEMO_DATA: bool = os.getenv("SEED_DEMO_DATA", "true") == "true"
