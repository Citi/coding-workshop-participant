"""SQL for deliverables and their dependency links (always parameterized).

A row in ``deliverable_dependencies`` means "deliverable_id depends on depends_on_id":
walking ``depends_on_id`` goes upstream (prerequisites), walking ``deliverable_id`` goes
downstream (the deliverables it blocks).
"""

from app.core.sql import like_pattern

DEPENDENCY_GRAPH_LOCK = 7_270_002  # advisory lock key (db.py uses 7_270_001 for the schema)
MAX_CHAIN_DEPTH = 1000  # safety net: the API rejects cycles, but bad data must never recurse forever

_SELECT_SQL = """
SELECT d.id, d.project_id, p.name AS project_name, d.name, d.description, d.status, d.due_date,
       d.is_key, d.owner_id, r.full_name AS owner_name,
       COALESCE(deps.ids, '{}') AS depends_on_ids, d.created_at, d.updated_at
FROM deliverables d
JOIN projects p ON p.id = d.project_id
LEFT JOIN resources r ON r.id = d.owner_id
LEFT JOIN LATERAL (
    SELECT array_agg(dd.depends_on_id ORDER BY dd.depends_on_id) AS ids
    FROM deliverable_dependencies dd
    WHERE dd.deliverable_id = d.id
) deps ON TRUE
"""

_LIST_SQL = (
    _SELECT_SQL
    + """
WHERE (%(search)s::text IS NULL
       OR d.name ILIKE %(search)s ESCAPE '\\'
       OR d.description ILIKE %(search)s ESCAPE '\\')
  AND (%(project_id)s::int IS NULL OR d.project_id = %(project_id)s)
  AND (%(status)s::text IS NULL OR d.status = %(status)s)
  AND (%(is_key)s::boolean IS NULL OR d.is_key = %(is_key)s)
  AND (%(owner_id)s::int IS NULL OR d.owner_id = %(owner_id)s)
ORDER BY d.due_date, d.id
"""
)

_NAME_TAKEN_SQL = """
SELECT EXISTS (
    SELECT 1 FROM deliverables
    WHERE project_id = %(project_id)s AND lower(name) = lower(%(name)s)
      AND (%(exclude_id)s::int IS NULL OR id <> %(exclude_id)s)
) AS taken
"""

_INSERT_SQL = """
INSERT INTO deliverables (project_id, name, description, status, due_date, is_key, owner_id)
VALUES (%(project_id)s, %(name)s, %(description)s, %(status)s, %(due_date)s, %(is_key)s, %(owner_id)s)
RETURNING id
"""

_UPDATE_SQL = """
UPDATE deliverables
SET project_id = %(project_id)s, name = %(name)s, description = %(description)s, status = %(status)s,
    due_date = %(due_date)s, is_key = %(is_key)s, owner_id = %(owner_id)s, updated_at = now()
WHERE id = %(id)s
"""

# Everything downstream of a deliverable; UNION (not UNION ALL) also stops on cyclic data.
_DEPENDENTS_AMONG_SQL = """
WITH RECURSIVE downstream (id) AS (
    SELECT deliverable_id FROM deliverable_dependencies WHERE depends_on_id = %(id)s
    UNION
    SELECT dd.deliverable_id
    FROM deliverable_dependencies dd
    JOIN downstream ds ON dd.depends_on_id = ds.id
)
SELECT id FROM downstream WHERE id = ANY(%(candidate_ids)s::int[]) ORDER BY id
"""

_RELATED_COLUMNS = "d.id, d.name, d.status, d.due_date, d.project_id, p.name AS project_name"

# Every upstream prerequisite, once, at the length of its shortest path (depth 1 = direct).
_CHAIN_SQL = f"""
WITH RECURSIVE upstream (id, depth) AS (
    SELECT depends_on_id, 1 FROM deliverable_dependencies WHERE deliverable_id = %(id)s
    UNION
    SELECT dd.depends_on_id, u.depth + 1
    FROM upstream u
    JOIN deliverable_dependencies dd ON dd.deliverable_id = u.id
    WHERE u.depth < %(max_depth)s
)
SELECT {_RELATED_COLUMNS}, c.depth
FROM (SELECT id, MIN(depth) AS depth FROM upstream GROUP BY id) c
JOIN deliverables d ON d.id = c.id
JOIN projects p ON p.id = d.project_id
ORDER BY c.depth, d.due_date, d.id
"""  # nosec B608 # only the constant column list is interpolated; values are bound parameters

_BLOCKS_SQL = f"""
SELECT {_RELATED_COLUMNS}
FROM deliverable_dependencies dd
JOIN deliverables d ON d.id = dd.deliverable_id
JOIN projects p ON p.id = d.project_id
WHERE dd.depends_on_id = %s
ORDER BY d.due_date, d.id
"""  # nosec B608 # only the constant column list is interpolated; values are bound parameters


def list_deliverables(conn, *, search=None, project_id=None, status=None, is_key=None, owner_id=None) -> list[dict]:
    """Deliverables matching the stored-field filters, sorted by due date, then id."""
    params = {
        "search": like_pattern(search) if search else None,
        "project_id": project_id,
        "status": status,
        "is_key": is_key,
        "owner_id": owner_id,
    }
    return conn.execute(_LIST_SQL, params).fetchall()


def find_deliverable(conn, deliverable_id: int) -> dict | None:
    """One deliverable with its project/owner names and prerequisite ids, or None."""
    return conn.execute(_SELECT_SQL + "WHERE d.id = %s", (deliverable_id,)).fetchone()


def find_existing_ids(conn, ids: list[int]) -> set[int]:
    """The subset of ``ids`` that are existing deliverables."""
    rows = conn.execute("SELECT id FROM deliverables WHERE id = ANY(%s::int[])", (list(ids),)).fetchall()
    return {row["id"] for row in rows}


def deliverable_exists(conn, deliverable_id: int) -> bool:
    """Existence check for the deliverable in the URL."""
    return bool(find_existing_ids(conn, [deliverable_id]))


def name_taken(conn, project_id: int, name: str, *, exclude_id: int | None = None) -> bool:
    """Case-insensitive name check within one project; ``exclude_id`` skips the deliverable being updated."""
    params = {"project_id": project_id, "name": name, "exclude_id": exclude_id}
    return conn.execute(_NAME_TAKEN_SQL, params).fetchone()["taken"]


def insert_deliverable(conn, values: dict) -> int:
    """Insert a deliverable (without its links) and return its id."""
    return conn.execute(_INSERT_SQL, values).fetchone()["id"]


def update_deliverable(conn, deliverable_id: int, values: dict) -> bool:
    """Overwrite every stored column (PUT is a full update); False when no row has this id."""
    return conn.execute(_UPDATE_SQL, {**values, "id": deliverable_id}).rowcount > 0


def delete_deliverable(conn, deliverable_id: int) -> bool:
    """Delete a deliverable; its dependency links in both directions cascade."""
    return conn.execute("DELETE FROM deliverables WHERE id = %s", (deliverable_id,)).rowcount > 0


def replace_dependencies(conn, deliverable_id: int, depends_on_ids: list[int]) -> None:
    """Make ``depends_on_ids`` the complete prerequisite set (inside the request's transaction)."""
    conn.execute("DELETE FROM deliverable_dependencies WHERE deliverable_id = %s", (deliverable_id,))
    if depends_on_ids:
        conn.execute(
            "INSERT INTO deliverable_dependencies (deliverable_id, depends_on_id) SELECT %s, unnest(%s::int[])",
            (deliverable_id, list(depends_on_ids)),
        )


def lock_dependency_graph(conn) -> None:
    """Serialize dependency changes until commit, so two concurrent edits cannot form a cycle."""
    conn.execute("SELECT pg_advisory_xact_lock(%s)", (DEPENDENCY_GRAPH_LOCK,))


def find_dependents_among(conn, deliverable_id: int, candidate_ids: list[int]) -> list[int]:
    """The candidates that already depend on ``deliverable_id``, directly or transitively."""
    params = {"id": deliverable_id, "candidate_ids": list(candidate_ids)}
    return [row["id"] for row in conn.execute(_DEPENDENTS_AMONG_SQL, params).fetchall()]


def find_dependency_chain(conn, deliverable_id: int) -> list[dict]:
    """All upstream prerequisites with their ``depth``, ordered by depth, then due date."""
    params = {"id": deliverable_id, "max_depth": MAX_CHAIN_DEPTH}
    return conn.execute(_CHAIN_SQL, params).fetchall()


def find_blocked(conn, deliverable_id: int) -> list[dict]:
    """The deliverables that directly depend on ``deliverable_id``."""
    return conn.execute(_BLOCKS_SQL, (deliverable_id,)).fetchall()
