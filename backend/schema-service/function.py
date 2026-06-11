"""Lambda entrypoint for initializing database schema tables."""

from __future__ import annotations

import json
from typing import Any

from postgres_service import initialize_tables


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Handle API requests and initialize tables when requested."""
    method = event["requestContext"]["http"]["method"]

    if method in {"POST", "GET"}:
        try:
            initialize_tables()
        except Exception as error:  # noqa: BLE001
            return {
                "statusCode": 500,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps(
                    {
                        "message": "Schema initialization failed",
                        "error": str(error),
                    }
                ),
            }

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "message": "Database schema initialized successfully"
                }
            ),
        }

    return {
        "statusCode": 405,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"message": "Method not allowed"}),
    }
