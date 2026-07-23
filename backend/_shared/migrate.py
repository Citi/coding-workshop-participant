"""
Schema bootstrap, run from inside the VPC.

Aurora is not publicly accessible (aws_rds_cluster_instance sets no
publicly_accessible flag, so it defaults to false), which means psql cannot
reach it from a workstation. The Lambdas sit in the same VPC and can, so
applying the schema is their job.

Invoked out-of-band, never over HTTP -- see the handler in auth/function.py.
"""

import logging
import os

from . import db

logger = logging.getLogger()

# sync-shared.sh copies backend/schema.sql in beside this module, because
# Terraform packages each Lambda from its own directory and cannot reach the
# canonical file at backend/schema.sql.
_HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(_HERE, "schema.sql")
SEED_PATH = os.path.join(_HERE, "seed.sql")


def run_migrations():
    """Applies schema.sql. Safe to run repeatedly.

    Every statement in the file is guarded -- CREATE TABLE IF NOT EXISTS,
    CREATE OR REPLACE, DROP TRIGGER IF EXISTS before each CREATE TRIGGER, and
    ON CONFLICT DO NOTHING on the role seed -- so re-running is a no-op rather
    than an error.

    The whole file is sent in one execute(): PostgreSQL parses the multi
    statement string server-side, which keeps the dollar-quoted function body
    ($$ ... $$) intact. Splitting on semicolons in Python would break it.
    """
    if not os.path.exists(SCHEMA_PATH):
        raise FileNotFoundError(
            f"{SCHEMA_PATH} is missing -- run backend/sync-shared.sh before deploying"
        )

    with open(SCHEMA_PATH, encoding="utf-8") as handle:
        sql = handle.read()

    logger.info("Applying schema from %s (%d bytes)", SCHEMA_PATH, len(sql))
    db.execute(sql)

    applied = verify()
    logger.info("Schema applied: %s", applied)
    return applied


def run_seed():
    """Applies seed.sql -- the sample portfolio.

    Safe to run repeatedly: every seeded row carries a fixed UUID and every
    INSERT ends with ON CONFLICT DO NOTHING, so a second run tops up anything
    missing rather than duplicating the data.
    """
    if not os.path.exists(SEED_PATH):
        raise FileNotFoundError(
            f"{SEED_PATH} is missing -- run backend/sync-shared.sh before deploying"
        )

    with open(SEED_PATH, encoding="utf-8") as handle:
        sql = handle.read()

    logger.info("Applying seed data from %s (%d bytes)", SEED_PATH, len(sql))
    db.execute(sql)

    return counts()


def counts():
    """Row counts per table, so a caller can confirm what actually landed."""
    row = db.query(
        """
        SELECT (SELECT COUNT(*) FROM users)                     AS users,
               (SELECT COUNT(*) FROM resources)                 AS resources,
               (SELECT COUNT(*) FROM projects)                  AS projects,
               (SELECT COUNT(*) FROM deliverables)              AS deliverables,
               (SELECT COUNT(*) FROM deliverable_dependencies)  AS dependencies,
               (SELECT COUNT(*) FROM allocations)               AS allocations,
               (SELECT COUNT(*) FROM expenses)                  AS expenses
        """,
        one=True,
    )
    return {key: int(value) for key, value in row.items()}


def verify():
    """Reports what the migration actually produced.

    Returned to the caller so a deploy can assert the schema landed, rather
    than trusting that no exception means success.
    """
    tables = db.query(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
        """
    )
    views = db.query(
        """
        SELECT table_name
        FROM information_schema.views
        WHERE table_schema = 'public'
        ORDER BY table_name
        """
    )
    roles = db.query("SELECT name FROM roles ORDER BY id")

    return {
        "tables": [row["table_name"] for row in tables],
        "views": [row["table_name"] for row in views],
        "roles": [row["name"] for row in roles],
    }
