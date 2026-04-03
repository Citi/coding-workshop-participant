"""
PostgreSQL database configuration and connection management.

This module handles PostgreSQL connection pooling using module-level variables
to reuse connections across Lambda invocations, improving performance and reducing
cold start time.
"""

from psycopg import connect

# Module-level PostgreSQL connection for connection pooling across Lambda invocations
# Persists between invocations within the same Lambda container
PG_CONN = None

def get_postgres_version(config):
    """
    Retrieves the PostgreSQL version using connection pooling with psycopg3.

    Reuses the module-level PG_CONN across invocations for better performance.
    Executes "SELECT version();" query to retrieve the version string.
    On connection failure or query error, resets the connection to None and raises the error.

    Connection pooling strategy:
    - First invocation: Creates a new connection and stores it in PG_CONN
    - Subsequent invocations: Reuses the existing connection if still open
    - On error: Resets PG_CONN to None to force reconnection on next invocation

    Returns:
        str: The PostgreSQL version string, or "unknown" if retrieval fails

    Raises:
        Exception: If connection or query fails
    """
    global PG_CONN
    try:
        # Create connection if not already pooled or if connection is closed
        if PG_CONN is None or PG_CONN.closed:
            PG_CONN = connect(config)

        # Execute version query and extract result using psycopg3 API
        with PG_CONN.cursor() as cur:
            cur.execute("SELECT version();")
            result = cur.fetchone()
            return result[0] if result else "unknown"
    except Exception as e:
        # Connection or query failed - reset connection and log error
        print("PostgreSQL error: %s", str(e))
        PG_CONN = None
        raise
