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

def get_all_projects():
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT
                    id,
                    name,
                    status,
                    start_date,
                    end_date,
                    budget_planned
                FROM projects
            """)

            rows = cursor.fetchall()

            return [
                {
                    "id": row[0],
                    "name": row[1],
                    "status": row[2],
                    "start_date": row[3].isoformat() if row[3] else None,
                    "end_date": row[4].isoformat() if row[4] else None,
                    "budget_planned": str(row[5])
                }
                for row in rows
            ]

    finally:
        conn.close()

def get_project_by_id(project_id):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT
                    id,
                    name,
                    status,
                    start_date,
                    end_date,
                    budget_planned
                FROM projects
                WHERE id = %s
            """, (project_id,))

            row = cursor.fetchone()

            if not row:
                return None

            return {
                "id": row[0],
                "name": row[1],
                "status": row[2],
                "start_date": row[3].isoformat() if row[3] else None,
                "end_date": row[4].isoformat() if row[4] else None,
                "budget_planned": str(row[5])
            }

    finally:
        conn.close()

def search_projects_by_name(name):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT
                    id,
                    name,
                    status,
                    start_date,
                    end_date,
                    budget_planned
                FROM projects
                WHERE name ILIKE %s
            """, (f"%{name}%",))

            rows = cursor.fetchall()

            return [
                {
                    "id": row[0],
                    "name": row[1],
                    "status": row[2],
                    "start_date": row[3].isoformat() if row[3] else None,
                    "end_date": row[4].isoformat() if row[4] else None,
                    "budget_planned": str(row[5])
                }
                for row in rows
            ]

    finally:
        conn.close()

def create_project(name, status, start_date, end_date, budget_planned):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            try:
                cursor.execute("""
                    INSERT INTO projects (name, status, start_date, end_date, budget_planned)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id
                """, (name, status, start_date, end_date, budget_planned))
            except psycopg2.Error as error:
                error_text = str(error).lower()

                if (
                    "null value in column \"id\"" in error_text
                    or "does not have a default value" in error_text
                    or "permission denied for sequence" in error_text
                ):
                    conn.rollback()
                    cursor.execute("""
                        INSERT INTO projects (id, name, status, start_date, end_date, budget_planned)
                        VALUES (
                            (SELECT COALESCE(MAX(id), 0) + 1 FROM projects),
                            %s,
                            %s,
                            %s,
                            %s,
                            %s
                        )
                        RETURNING id
                    """, (name, status, start_date, end_date, budget_planned))
                else:
                    raise

            project_id = cursor.fetchone()[0]
            conn.commit()

            return get_project_by_id(project_id)

    finally:
        conn.close()

def update_project(project_id, name, status, start_date, end_date, budget_planned):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                UPDATE projects
                SET name = %s,
                    status = %s,
                    start_date = %s,
                    end_date = %s,
                    budget_planned = %s
                WHERE id = %s
            """, (name, status, start_date, end_date, budget_planned, project_id))

            conn.commit()

            return get_project_by_id(project_id)

    finally:
        conn.close()

def delete_project(project_id):
    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                DELETE FROM projects
                WHERE id = %s
            """, (project_id,))

            conn.commit()

            return {
                "message": f"Project with id {project_id} deleted successfully"
            }

    finally:
        conn.close()