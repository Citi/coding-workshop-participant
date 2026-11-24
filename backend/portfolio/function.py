"""AWS Lambda entry point for the portfolio service."""

import logging
from typing import Any

from mangum import Mangum

from app.main import create_app
from app.tasks import run_task

logging.getLogger().setLevel(logging.INFO)

app = create_app()

# CloudFront forwards /api/portfolio/... unchanged; the local proxy strips the prefix.
# Mangum removes the prefix only when present, so both forms reach the same routes.
_asgi_handler = Mangum(app, lifespan="off", api_gateway_base_path="/api/portfolio")


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Route direct-invoke task events to DB tasks and everything else to FastAPI."""
    if isinstance(event, dict) and "task" in event and "requestContext" not in event:
        return run_task(event)
    return _asgi_handler(event, context)
