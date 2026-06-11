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


def get_all_people():
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT
                    id, name, role, hourly_rate
                FROM people
            """)

            rows = cursor.fetchall()

            return [
                {
                    "id": row[0],
                    "name": row[1],
                    "role": row[2],
                    "hourly_rate": float(row[3])
                }
                for row in rows
            ]

    finally:
        conn.close()

def get_person_by_id(person_id):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, name, role, hourly_rate
                FROM people
                WHERE id = %s
                """,
                (person_id,)
            )

            row = cursor.fetchone()

            if not row:
                return None

            return {
                "id": person_id,
                "name": row[1],
                "role": row[2],
                "hourly_rate": float(row[3])
            }

    finally:
        conn.close()

def search_person_by_name(name):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, name, role, hourly_rate
                FROM people
                WHERE name ILIKE %s
                """,
                (f"%{name}%",)
            )

            rows = cursor.fetchall()

            if not rows:
                return None

            return [
                {
                    "id": row[0],
                    "name": row[1],
                    "role": row[2],
                    "hourly_rate": float(row[3])
                }
                for row in rows
            ]

    finally:
        conn.close()

def create_person(name, role, hourly_rate):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO people (name, role, hourly_rate)
                VALUES (%s, %s, %s)
                RETURNING id
                """,
                (name, role, hourly_rate)
            )

            person_id = cursor.fetchone()[0]
            conn.commit()

            return {
                "id": person_id,
                "name": name,
                "role": role,
                "hourly_rate": float(hourly_rate)
            }

    finally:
        conn.close()

def update_person(person_id, name, role, hourly_rate):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE people
                SET name = %s, role = %s, hourly_rate = %s
                WHERE id = %s
                """,
                (name, role, hourly_rate, person_id)
            )

            conn.commit()

            return {
                "id": person_id,
                "name": name,
                "role": role,
                "hourly_rate": float(hourly_rate)
            }

    finally:
        conn.close()

def delete_person(person_id):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM people
                WHERE id = %s
                """,
                (person_id,)
            )

            conn.commit()

    finally:
        conn.close()