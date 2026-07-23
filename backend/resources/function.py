"""
Resources service — Lambda entry point.

Routes:
    GET    /resources                    auth    list, utilization included
    POST   /resources                    create
    GET    /resources/utilization        auth    over-allocation report
    GET    /resources/{id}               auth    person + their projects
    PUT    /resources/{id}               update
    DELETE /resources/{id}               delete  allocations cascade
    GET    /resources/{id}/allocations   auth
    GET    /allocations                  auth    filterable
    POST   /allocations                  create  warns on over-allocation
    PUT    /allocations/{id}             update
    DELETE /allocations/{id}             delete
    GET    /health                       public

Query parameters: search, roleTitle, overAllocated, availableOnly on
/resources; resourceId, projectId, activeOnly on /allocations.
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
        return ok({"status": "ok", "service": "resources"})
    return server_error("Database is unreachable")


router = Router("resources")

router.add("GET", "/health", _health)

# Registered before /resources/{id} so the literal path is not swallowed by the
# parameterised one -- routes match in the order they are added.
router.add("GET", "/resources/utilization", routes.get_utilization)

router.add("GET", "/resources", routes.list_resources)
router.add("POST", "/resources", routes.create_resource)
router.add("GET", "/resources/{id}", routes.get_resource)
router.add("PUT", "/resources/{id}", routes.update_resource)
router.add("DELETE", "/resources/{id}", routes.delete_resource)
router.add("GET", "/resources/{id}/allocations", routes.list_resource_allocations)

router.add("GET", "/allocations", routes.list_allocations)
router.add("POST", "/allocations", routes.create_allocation)
router.add("PUT", "/allocations/{id}", routes.update_allocation)
router.add("DELETE", "/allocations/{id}", routes.delete_allocation)

router.add("GET", "/", routes.list_resources)
router.add("POST", "/", routes.create_resource)


def handler(event=None, context=None):
    """Lambda entry point."""
    return router.dispatch(event or {})


if __name__ == "__main__":
    print(handler({"rawPath": "/health", "requestContext": {"http": {"method": "GET"}}}))
