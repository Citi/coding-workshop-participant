"""
MongoDB database configuration and connection management.

This module handles MongoDB connection pooling using module-level variables
to reuse connections across Lambda invocations, improving performance and reducing
cold start time.
"""

from pymongo import MongoClient

# Module-level MongoDB client for connection pooling across Lambda invocations
# Persists between invocations within the same Lambda container
MONGO_CLIENT = None

def get_mongo_version(config):
    """
    Retrieves the MongoDB version using connection pooling.

    Reuses the module-level MONGO_CLIENT across invocations for better performance.
    Executes the admin.buildInfo command to retrieve version information.
    On connection failure or command error, resets the client to None and raises the error.

    Connection pooling strategy:
    - First invocation: Creates a new MongoDB client and stores it in MONGO_CLIENT
    - Subsequent invocations: Reuses the existing client
    - On error: Resets MONGO_CLIENT to None to force reconnection on next invocation

    Returns:
        str: The MongoDB version string, or "unknown" if retrieval fails

    Raises:
        Exception: If connection or command fails
    """
    global MONGO_CLIENT
    try:
        # Create client if not already pooled
        if MONGO_CLIENT is None:
            MONGO_CLIENT = MongoClient(**config)

        # Execute buildInfo command and extract version
        info = MONGO_CLIENT.admin.command("buildInfo")
        return info.get("version", "unknown")
    except Exception as e:
        # Connection or command failed - reset client and log error
        print("MongoDB error: %s", str(e))
        MONGO_CLIENT = None
        raise
