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

def get_total_weeks(id):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT (end_date - start_date)
                FROM projects
                WHERE id = %s
                """,
                (id,)
            )

            row = cursor.fetchone()

            if not row:
                return None

            return row[0] / 7 

    finally:
        conn.close()

def get_weekly_cost(id):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT SUM(hours_per_week * hourly_rate)
                FROM resource_allocations
                JOIN people ON resource_allocations.person_id = people.id
                WHERE project_id = %s
                """,
                (id,)
            )

            row = cursor.fetchone()

            if not row:
                return None

            return row[0]
    finally:
        conn.close()