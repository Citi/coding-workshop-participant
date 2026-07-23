"""
Deliverables service — Lambda entry point.

Routes:
    GET    /deliverables                            auth     list, with filters
    POST   /deliverables                            create
    GET    /deliverables/{id}                       auth
    PUT    /deliverables/{id}                       update
    PATCH  /deliverables/{id}/status                update   status-only move
    DELETE /deliverables/{id}                       delete
    GET    /deliverables/{id}/chain                 auth     prerequisite chain
    POST   /deliverables/{id}/dependencies          update   add an edge
    DELETE /deliverables/{id}/dependencies/{dependsOnId}     remove an edge
    GET    /projects/{projectId}/graph              auth     nodes + edges
    GET    /health                                  public

Query parameters on the list endpoint: projectId, status, assigneeId,
dueBefore, overdueOnly, search.
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
        return ok({"status": "ok", "service": "deliverables"})
    return server_error("Database is unreachable")


router = Router("deliverables")

router.add("GET", "/health", _health)

router.add("GET", "/deliverables", routes.list_deliverables)
router.add("POST", "/deliverables", routes.create_deliverable)
router.add("GET", "/deliverables/{id}", routes.get_deliverable)
router.add("PUT", "/deliverables/{id}", routes.update_deliverable)
router.add("PATCH", "/deliverables/{id}/status", routes.update_status)
router.add("DELETE", "/deliverables/{id}", routes.delete_deliverable)

router.add("GET", "/deliverables/{id}/chain", routes.get_chain)
router.add("POST", "/deliverables/{id}/dependencies", routes.add_dependency)
router.add("DELETE", "/deliverables/{id}/dependencies/{dependsOnId}", routes.remove_dependency)

router.add("GET", "/projects/{projectId}/graph", routes.get_project_graph)

# The local proxy strips the /api/deliverables prefix, so the collection
# arrives here as "/".
router.add("GET", "/", routes.list_deliverables)
router.add("POST", "/", routes.create_deliverable)


def handler(event=None, context=None):
    """Lambda entry point."""
    return router.dispatch(event or {})


if __name__ == "__main__":
    print(handler({"rawPath": "/health", "requestContext": {"http": {"method": "GET"}}}))
