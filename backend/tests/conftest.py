"""Test environment for pm-service. Runs before any ``app`` import.

Integration tests use a dedicated database (default ``pm_test``; override with
``TEST_DB_NAME`` so parallel runs never share data). The local PostgreSQL started by
``bin/start-dev.sh`` trusts connections arriving over the Docker bridge (172.17.0.1).
"""

import os

TEST_DB_NAME = os.environ.get("TEST_DB_NAME", "pm_test")

os.environ.update(
    {
        "IS_LOCAL": "true",
        "POSTGRES_HOST": os.environ.get("TEST_POSTGRES_HOST", "172.17.0.1"),
        "POSTGRES_PORT": os.environ.get("TEST_POSTGRES_PORT", "5432"),
        "POSTGRES_NAME": TEST_DB_NAME,
        "POSTGRES_USER": os.environ.get("TEST_POSTGRES_USER", "postgres"),
        "POSTGRES_PASS": os.environ.get("TEST_POSTGRES_PASS", ""),
        "JWT_SECRET": "pytest-only-jwt-secret-0123456789abcdef",
        "BCRYPT_ROUNDS": "4",  # fast hashing in tests; production uses 10
    }
)
