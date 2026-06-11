"""Database schema bootstrap helpers for the schema service."""

from __future__ import annotations

import os

import psycopg2
from psycopg2 import sql


def _connect(
    database_name: str,
    autocommit: bool = False,
) -> psycopg2.extensions.connection:
    """Create a PostgreSQL connection using environment variables."""
    conn = psycopg2.connect(
        host=os.getenv("POSTGRES_HOST"),
        port=os.getenv("POSTGRES_PORT"),
        database=database_name,
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASS"),
    )

    if autocommit:
        conn.autocommit = True

    return conn


def _ensure_database_exists(database_name: str) -> None:
    """Create the target database if it does not exist yet."""
    conn = _connect("postgres", autocommit=True)

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s",
                (database_name,),
            )

            exists = cursor.fetchone()

            if not exists:
                cursor.execute(
                    sql.SQL("CREATE DATABASE {}")
                    .format(sql.Identifier(database_name))
                )
    finally:
        conn.close()


def get_connection() -> psycopg2.extensions.connection:
    """Create a connection, creating the target database if needed."""
    database_name = (
        os.getenv("POSTGRES_NAME")
        or "project_tracker"
    )

    try:
        return _connect(database_name)
    except psycopg2.OperationalError as error:
        if "does not exist" not in str(error).lower():
            raise

        _ensure_database_exists(database_name)
        return _connect(database_name)


def initialize_tables() -> None:
    """Create all required workshop tables if they do not already exist."""
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    start_date DATE,
                    end_date DATE,
                    budget_planned NUMERIC(12, 2) DEFAULT 0
                )
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS people (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    hourly_rate NUMERIC(10, 2) DEFAULT 0
                )
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS deliverables (
                    id SERIAL PRIMARY KEY,
                    project_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    status TEXT NOT NULL,
                    due_date DATE,
                    estimated_hours NUMERIC(10, 2) DEFAULT 0,
                    depends_on_deliverable_id INTEGER,
                    CONSTRAINT fk_deliverables_project
                        FOREIGN KEY (project_id)
                        REFERENCES projects(id)
                        ON DELETE CASCADE,
                    CONSTRAINT fk_deliverables_dependency
                        FOREIGN KEY (depends_on_deliverable_id)
                        REFERENCES deliverables(id)
                        ON DELETE SET NULL
                )
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS resource_allocations (
                    id SERIAL PRIMARY KEY,
                    person_id INTEGER NOT NULL,
                    project_id INTEGER NOT NULL,
                    hours_per_week INTEGER NOT NULL DEFAULT 0,
                    CONSTRAINT fk_resource_person
                        FOREIGN KEY (person_id)
                        REFERENCES people(id)
                        ON DELETE CASCADE,
                    CONSTRAINT fk_resource_project
                        FOREIGN KEY (project_id)
                        REFERENCES projects(id)
                        ON DELETE CASCADE,
                    CONSTRAINT uq_resource_person_project
                        UNIQUE (person_id, project_id)
                )
                """
            )

            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_deliverables_project_id
                ON deliverables(project_id)
                """
            )

            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_resource_allocations_project_id
                ON resource_allocations(project_id)
                """
            )

            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_resource_allocations_person_id
                ON resource_allocations(person_id)
                """
            )

        conn.commit()
    finally:
        conn.close()
