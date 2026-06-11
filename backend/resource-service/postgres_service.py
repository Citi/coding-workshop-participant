import os
import psycopg2

def get_connection():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST"),
        port=os.getenv("POSTGRES_PORT"),
        database=os.getenv("POSTGRES_NAME") or "project_tracker",
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASS")
    )

def get_all_resources():
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT
                    id, person_id, project_id, hours_per_week
                FROM resource_allocations
            """)

            rows = cursor.fetchall()

            return [
                {
                    "id": row[0],
                    "person_id": row[1],
                    "project_id": row[2],
                    "hours_per_week": row[3]
                }
                for row in rows
            ]

    finally:
        conn.close()

def get_resource_by_id(resource_id):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, person_id, project_id, hours_per_week
                FROM resource_allocations
                WHERE id = %s
                """,
                (resource_id,)
            )

            row = cursor.fetchone()

            if not row:
                return None

            return {
                "id": row[0],
                "person_id": row[1],
                "project_id": row[2],
                "hours_per_week": row[3]
            }

    finally:
        conn.close()

def search_resources_by_person_id(person_id):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, person_id, project_id, hours_per_week
                FROM resource_allocations
                WHERE person_id = %s
                """,
                (person_id,)
            )

            rows = cursor.fetchall()

            return [
                {
                    "id": row[0],
                    "person_id": row[1],
                    "project_id": row[2],
                    "hours_per_week": row[3]
                }
                for row in rows
            ]

    finally:
        conn.close()

def search_resources_by_project_id(project_id):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, person_id, project_id, hours_per_week
                FROM resource_allocations
                WHERE project_id = %s
                """,
                (project_id,)
            )

            rows = cursor.fetchall()

            return [
                {
                    "id": row[0],
                    "person_id": row[1],
                    "project_id": row[2],
                    "hours_per_week": row[3]
                }
                for row in rows
            ]

    finally:
        conn.close()

def create_resource(person_id, project_id, hours_per_week):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO resource_allocations (person_id, project_id, hours_per_week)
                VALUES (%s, %s, %s)
                RETURNING id
                """,
                (person_id, project_id, hours_per_week)
            )

            new_id = cursor.fetchone()[0]
            conn.commit()

            return new_id

    finally:
        conn.close()

def update_resource(resource_id, person_id, project_id, hours_per_week):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE resource_allocations
                SET person_id = %s, project_id = %s, hours_per_week = %s
                WHERE id = %s
                """,
                (person_id, project_id, hours_per_week, resource_id)
            )

            conn.commit()

    finally:
        conn.close()

def delete_resource(resource_id):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM resource_allocations
                WHERE id = %s
                """,
                (resource_id,)
            )

            conn.commit()

    finally:
        conn.close()