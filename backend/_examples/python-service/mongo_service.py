"""
MongoDB database configuration and connection management.

This module handles MongoDB connection pooling using module-level variables
to reuse connections across Lambda invocations, improving performance and reducing
cold start time.
"""

from pymongo import MongoClient

# Module-level MongoDB client for connection pooling across Lambda invocations
# Persists between invocations within the same Lambda container
mongo_client = None

def get_mongo_version(config):
    """
    Retrieves the MongoDB version using connection pooling.

    Reuses the module-level mongo_client across invocations for better performance.
    Executes the admin.buildInfo command to retrieve version information.
    On connection failure or command error, resets the client to None and raises the error.

    Connection pooling strategy:
    - First invocation: Creates a new MongoDB client and stores it in mongo_client
    - Subsequent invocations: Reuses the existing client
    - On error: Resets mongo_client to None to force reconnection on next invocation

    Returns:
        str: The MongoDB version string, or "unknown" if retrieval fails

    Raises:
        Exception: If connection or command fails
    """
    global mongo_client
    try:
        # Create client if not already pooled
        if mongo_client is None:
            mongo_client = MongoClient(**config)

        # Execute buildInfo command and extract version
        info = mongo_client.admin.command("buildInfo")
        return info.get("version", "unknown")
    except Exception as e:
        # Connection or command failed - reset client and log error
        mongo_client = None
        raise
