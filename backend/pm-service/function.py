"""AWS Lambda entry point for the ACME project tracker API (pm-service).

Terraform configures the handler as ``function.handler``; all routing and
business logic lives in the ``app`` package.
"""

from app.main import handle


def handler(event=None, context=None):
    """Lambda handler: turns a Lambda Function URL event into an HTTP response."""
    return handle(event or {}, context)
