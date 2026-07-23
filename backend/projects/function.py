"""
Projects service — Lambda entry point.

Routes:
    GET    /projects              auth          list, with filters
    POST   /projects              create perm   new project
    GET    /projects/{id}         auth          one project
    GET    /projects/{id}/summary auth          deliverable + budget roll-up
    PUT    /projects/{id}         update perm   partial update
    DELETE /projects/{id}         delete perm   cascades to child records
    GET    /health                public        connectivity probe

Query parameters on the list endpoint: search, status, department, ownerId,
atRisk.
"""

import logging
import os
import sys

# The synced _shared package sits beside this file; make sure it is importable
# regardless of the runtime's working directory.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import routes  # noqa: E402
from _shared import db  # noqa: E402
from _shared.responses import ok, server_error  # noqa: E402
from _shared.router import Router  # noqa: E402

logger = logging.getLogger()
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))


def _health(event):
    if db.health_check():
        return ok({"status": "ok", "service": "projects"})
    return server_error("Database is unreachable")


router = Router("projects")

router.add("GET", "/health", _health)

router.add("GET", "/projects", routes.list_projects)
router.add("POST", "/projects", routes.create_project)
router.add("GET", "/projects/{id}", routes.get_project)
router.add("GET", "/projects/{id}/summary", routes.get_summary)
router.add("PUT", "/projects/{id}", routes.update_project)
router.add("DELETE", "/projects/{id}", routes.delete_project)

# The local proxy strips the /api/projects prefix, so a request to
# /api/projects arrives here as "/". Mapping the bare root keeps the collection
# reachable in both deployments.
router.add("GET", "/", routes.list_projects)
router.add("POST", "/", routes.create_project)


def handler(event=None, context=None):
    """Lambda entry point."""
    return router.dispatch(event or {})


if __name__ == "__main__":
    print(handler({"rawPath": "/health", "requestContext": {"http": {"method": "GET"}}}))
