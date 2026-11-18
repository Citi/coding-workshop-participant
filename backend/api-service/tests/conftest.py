"""
Shared test setup.

The app reads its database settings at import time, so they are pointed at a
throwaway database here, before any test imports `app`. Your real `postgres`
database is never touched.

Override with TEST_POSTGRES_HOST / _PORT / _USER / _PASS / _NAME if needed.
"""

import os

TEST_DB = os.environ.get("TEST_POSTGRES_NAME", "facility_desk_test")

os.environ["POSTGRES_HOST"] = os.environ.get("TEST_POSTGRES_HOST", "localhost")
os.environ["POSTGRES_PORT"] = os.environ.get("TEST_POSTGRES_PORT", "5432")
os.environ["POSTGRES_USER"] = os.environ.get("TEST_POSTGRES_USER", "postgres")
os.environ["POSTGRES_PASS"] = os.environ.get("TEST_POSTGRES_PASS", "postgres123")
os.environ["POSTGRES_NAME"] = TEST_DB
os.environ["JWT_SECRET"] = "test-only-secret"
os.environ.pop("CORS_ORIGINS", None)

if TEST_DB in {"postgres", "template0", "template1"}:
    raise RuntimeError(f"Refusing to run tests against the '{TEST_DB}' database.")


def pytest_collection_modifyitems(items):
    import pytest
    for item in items:
        if "integration" in item.path.parts:
            item.add_marker(pytest.mark.integration)
