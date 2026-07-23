"""
Reports service — Lambda entry point.

Read-only aggregates. Each route maps onto one of ACME's business questions:

    GET /reports/summary        dashboard counters
    GET /reports/at-risk        "which projects are at risk?"
    GET /reports/utilization    "who is over-allocated?"
    GET /reports/allocations    "how are resources allocated across projects?"
    GET /reports/dependencies   "what is the dependency chain?" + bottlenecks
    GET /reports/budget         "budget consumed vs planned?"
    GET /health                 public

No models.py: this service performs no writes, so there is nothing to validate.
"""

import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import routes  # noqa: E402
from _shared import db  # noqa: E402
from _shared.responses import ok, server_error  # noqa: E402
from _shared.router import Router  # noqa: E402

logger = logging.getLogger()
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))


def _health(event):
    if db.health_check():
        return ok({"status": "ok", "service": "reports"})
    return server_error("Database is unreachable")


router = Router("reports")

router.add("GET", "/health", _health)

router.add("GET", "/reports/summary", routes.summary)
router.add("GET", "/reports/at-risk", routes.at_risk)
router.add("GET", "/reports/utilization", routes.utilization)
router.add("GET", "/reports/allocations", routes.allocations)
router.add("GET", "/reports/dependencies", routes.dependencies)
router.add("GET", "/reports/budget", routes.budget)

# Bare forms, for when the local proxy has stripped the /api/reports prefix.
router.add("GET", "/summary", routes.summary)
router.add("GET", "/at-risk", routes.at_risk)
router.add("GET", "/utilization", routes.utilization)
router.add("GET", "/allocations", routes.allocations)
router.add("GET", "/dependencies", routes.dependencies)
router.add("GET", "/budget", routes.budget)


def handler(event=None, context=None):
    """Lambda entry point."""
    return router.dispatch(event or {})


if __name__ == "__main__":
    print(handler({"rawPath": "/health", "requestContext": {"http": {"method": "GET"}}}))
