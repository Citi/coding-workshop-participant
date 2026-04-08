"""
Sample code: Hello World with PostgreSQL and MongoDB connectivity.
"""

import json
import logging
import os
from postgres_service import get_postgres_version
from mongo_service import get_mongo_version

# Configure logging for Lambda
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# PostgreSQL connection string built from environment variables with sensible defaults
PG_CONFIG = (
    f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
    f"port={os.getenv('POSTGRES_PORT', '5432')} "
    f"user={os.getenv('POSTGRES_USER', 'test')} "
    f"password={os.getenv('POSTGRES_PASS', 'test')} "
    f"dbname={os.getenv('POSTGRES_NAME', 'test')} "
    f"connect_timeout=15"
)

# MongoDB configuration loaded from environment variables with sensible defaults
MONGO_CONFIG = {
    "host": os.getenv("MONGO_HOST", "localhost"),
    "port": int(os.getenv("MONGO_PORT", "27017")),
    "user": os.getenv("MONGO_USER", "test"),
    "password": os.getenv("MONGO_PASS", "test"),
    "database": os.getenv("MONGO_NAME", "test"),
    "serverSelectionTimeoutMS": 5000,
    "socketTimeoutMS": 45000,
}

def handler(event=None, context=None):
    """
    Sample code: Hello World with PostgreSQL and MongoDB connectivity.

    Args:
        event (dict, optional): The Lambda event
        context (object, optional): The Lambda context

    Returns:
        dict: A response object with statusCode, headers, and body
            - statusCode: 200 on success, 500 on error
            - headers: Content-Type set to application/json
            - body: JSON string with database versions or error message
    """
    logger.debug("Received event: %s", event)
    logger.debug("Received context: %s", context)

    try:
        # Retrieve versions from both databases
        pg_version = get_postgres_version(PG_CONFIG)
        mongo_version = get_mongo_version(MONGO_CONFIG)

        # Log retrieved versions for debugging
        logger.info("PostgreSQL Version: %s", pg_version)
        logger.info("MongoDB Version: %s", mongo_version)

        # Return successful response with database versions
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "message": "Hello, World!",
                "postgres": pg_version,
                "mongodb": mongo_version,
            }),
        }
    except Exception as e:
        # Return error response on any exception
        logger.error("Handler error: %s", str(e))
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "error": "Failed to retrieve database versions",
                "message": str(e),
            }),
        }

# Main entry point for local testing
if __name__ == "__main__":
    print(handler())
