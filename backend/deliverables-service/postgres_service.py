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


def get_all_deliverables():
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT
                    id, project_id, name, description, status, due_date, estimated_hours, depends_on_deliverable_id
                FROM deliverables
            """)

            rows = cursor.fetchall()

            return [
                {
                    "id": row[0],
                    "project_id": row[1],
                    "name": row[2],
                    "description": row[3],
                    "status": row[4],
                    "due_date": row[5].isoformat() if row[5] else None,
                    "estimated_hours": str(row[6]),
                    "depends_on_deliverable_id": row[7]
                }
                for row in rows
            ]

    finally:
        conn.close()

def get_deliverable_by_id(deliverable_id):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, project_id, name, description, status, due_date, estimated_hours, depends_on_deliverable_id
                FROM deliverables
                WHERE id = %s
                """,
                (deliverable_id,)
            )

            row = cursor.fetchone()

            if not row:
                return None

            return {
                "id": deliverable_id,
                "project_id": row[1],
                "name": row[2],
                "description": row[3],
                "status": row[4],
                "due_date": row[5].isoformat() if row[5] else None,
                "estimated_hours": str(row[6]),
                "depends_on_deliverable_id": row[7]
            }

    finally:
        conn.close()

def get_deliverables_by_project_id(project_id):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, project_id, name, description, status, due_date, estimated_hours, depends_on_deliverable_id
                FROM deliverables
                WHERE project_id = %s
                """,
                (project_id,)
            )

            rows = cursor.fetchall()

            return [
                {
                    "id": row[0],
                    "project_id": row[1],
                    "name": row[2],
                    "description": row[3],
                    "status": row[4],
                    "due_date": str(row[5].isoformat()) if row[5] else None,
                    "estimated_hours": str(row[6]),
                    "depends_on_deliverable_id": row[7]
                }
                for row in rows
            ]

    finally:
        conn.close()

def search_deliverables_by_name(name):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, project_id, name, description, status, due_date, estimated_hours, depends_on_deliverable_id
                FROM deliverables
                WHERE name ILIKE %s
                """,
                (f"%{name}%",)
            )

            rows = cursor.fetchall()

            return [
                {
                    "id": row[0],
                    "project_id": row[1],
                    "name": row[2],
                    "description": row[3],
                    "status": row[4],
                    "due_date": row[5].isoformat() if row[5] else None,
                    "estimated_hours": str(row[6]),
                    "depends_on_deliverable_id": row[7]
                }
                for row in rows
            ]

    finally:
        conn.close()

def create_deliverable(project_id, name, description, status, due_date, estimated_hours, depends_on_deliverable_id=None):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO deliverables (project_id, name, description, status, due_date, estimated_hours, depends_on_deliverable_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (project_id, name, description, status, due_date, estimated_hours, depends_on_deliverable_id)
            )

            new_id = cursor.fetchone()[0]
            conn.commit()
            return new_id

    finally:
        conn.close()

def update_deliverable(deliverable_id, project_id, name, description, status, due_date, estimated_hours, depends_on_deliverable_id=None):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE deliverables
                SET project_id = %s,
                    name = %s,
                    description = %s,
                    status = %s,
                    due_date = %s,
                    estimated_hours = %s,
                    depends_on_deliverable_id = %s
                WHERE id = %s
                """,
                (project_id, name, description, status, due_date, estimated_hours, depends_on_deliverable_id, deliverable_id)
            )

            conn.commit()

            return get_deliverable_by_id(deliverable_id)

    finally:
        conn.close()

def delete_deliverable(deliverable_id):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM deliverables
                WHERE id = %s
                """,
                (deliverable_id,)
            )

            conn.commit()

            return {
                "message": f"Deliverable with id {deliverable_id} deleted successfully"
            }

    finally:
        conn.close()