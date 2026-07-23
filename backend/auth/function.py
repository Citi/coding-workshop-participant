"""
Auth service — Lambda entry point.

Routes:
    POST   /register            public   self-service signup
    POST   /login               public   credentials -> token pair
    POST   /refresh             public   rotate a refresh token
    POST   /logout              public   client-side session end
    GET    /me                  auth     current user
    POST   /change-password     auth     change own password
    GET    /users               Admin
    POST   /users               Admin
    GET    /users/{id}          Admin
    PUT    /users/{id}          Admin
    PATCH  /users/{id}/role     Admin
    DELETE /users/{id}          Admin
    GET    /health              public   connectivity probe

Locally these are reached as /api/auth/... through bin/proxy-server.js; in the
cloud CloudFront forwards /api/auth* to this function. The Router normalises
both forms.
"""

import logging
import os
import sys

# The synced _shared package sits beside this file. Lambda's working directory
# is not guaranteed to be on sys.path for every runtime/invocation path, so add
# it explicitly rather than relying on it.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import routes  # noqa: E402
from _shared import db  # noqa: E402
from _shared.responses import ok, server_error  # noqa: E402
from _shared.router import Router  # noqa: E402

logger = logging.getLogger()
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))


def _health(event):
    """Reports whether the function can reach the database."""
    if db.health_check():
        return ok({"status": "ok", "service": "auth"})
    return server_error("Database is unreachable")


router = Router("auth")

router.add("GET", "/health", _health)

router.add("POST", "/register", routes.register)
router.add("POST", "/login", routes.login)
router.add("POST", "/refresh", routes.refresh)
router.add("POST", "/logout", routes.logout)

router.add("GET", "/me", routes.me)
router.add("POST", "/change-password", routes.change_password)

router.add("GET", "/users", routes.list_users)
router.add("POST", "/users", routes.create_user)
router.add("GET", "/users/{id}", routes.get_user)
router.add("PUT", "/users/{id}", routes.update_user)
router.add("PATCH", "/users/{id}/role", routes.update_role)
router.add("DELETE", "/users/{id}", routes.delete_user)


def handler(event=None, context=None):
    """Lambda entry point.

    Handles one out-of-band action before HTTP routing: a direct invoke of the
    form {"action": "migrate"} applies backend/schema.sql.

    This is safe to gate on the event shape. A Lambda Function URL request
    always arrives with a requestContext that AWS itself populates, so a
    caller on the public URL cannot forge this envelope no matter what body
    they send. Reaching it requires lambda:InvokeFunction on the function --
    IAM is the authorisation boundary:

        aws lambda invoke --function-name coding-workshop-auth-<id> \\
            --payload '{"action":"migrate"}' --cli-binary-format raw-in-base64-out \\
            /dev/stdout
    """
    event = event or {}

    if "requestContext" not in event and event.get("action") in ("migrate", "seed"):
        from _shared import migrate

        action = event["action"]
        logger.info("Running %s by direct invoke", action)

        if action == "seed":
            return {"status": "ok", "counts": migrate.run_seed()}

        return {"status": "ok", "applied": migrate.run_migrations()}

    return router.dispatch(event)


if __name__ == "__main__":
    # Local smoke test: python function.py
    print(handler({"rawPath": "/health", "requestContext": {"http": {"method": "GET"}}}))
