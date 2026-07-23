"""
Minimal request router for Lambda Function URLs.

Added beyond the four canonical shared modules because without it the same
path-parsing and error-mapping block would be copied into all six services --
exactly the duplication the guide warns against.

    router = Router("auth")
    router.add("POST", "/login", routes.login)
    router.add("GET", "/users/{id}", routes.get_user)

    def handler(event, context):
        return router.dispatch(event)
"""

import logging
import re

import psycopg2

from .auth import AuthError
from .responses import bad_request, error, not_found, response, server_error
from .validation import ValidationError

logger = logging.getLogger()

# "/projects/{id}/deliverables" -> a regex capturing `id`.
_PARAM_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")


def _compile(path):
    # Escape first so literal dots and dashes cannot act as regex syntax, then
    # swap the escaped placeholders for capture groups.
    pattern = re.escape(path)
    pattern = _PARAM_RE.sub(lambda m: f"(?P<{m.group(1)}>[^/]+)", pattern.replace(r"\{", "{").replace(r"\}", "}"))
    return re.compile(f"^{pattern}/?$")


class Router:
    """Maps (method, path) to a handler function.

    Handlers are called as `handler(event, **path_params)` and must return a
    response dict from responses.py.
    """

    def __init__(self, service_name):
        self.service_name = service_name
        self._routes = []

    def add(self, method, path, handler):
        self._routes.append((method.upper(), _compile(path), handler))
        return self

    def _path(self, event):
        """Extracts the request path, normalised across both deployments.

        CloudFront forwards `/api/{service}/login` to the Lambda with the
        prefix intact (infra/cloudfront.tf routes on `/api/{name}*`), whereas
        bin/proxy-server.js strips it and sends `/login`. Normalising here means
        routes are declared once, in the local form.
        """
        raw = (
            event.get("rawPath")
            or event.get("path")
            or (event.get("requestContext", {}).get("http", {}) or {}).get("path")
            or "/"
        )

        prefix = f"/api/{self.service_name}"
        if raw == prefix:
            return "/"
        if raw.startswith(prefix + "/"):
            return raw[len(prefix):]
        return raw

    @staticmethod
    def _method(event):
        return (
            (event.get("requestContext", {}).get("http", {}) or {}).get("method")
            or event.get("httpMethod")
            or "GET"
        ).upper()

    def dispatch(self, event):
        """Routes the request and converts any raised error into a response."""
        method = self._method(event)
        path = self._path(event)

        # The Function URL CORS config answers most preflights, but a direct
        # or proxied OPTIONS still needs a reply.
        if method == "OPTIONS":
            return response(204)

        matched_path = False
        for route_method, pattern, handler in self._routes:
            match = pattern.match(path)
            if not match:
                continue
            matched_path = True
            if route_method != method:
                continue

            try:
                return handler(event, **match.groupdict())

            except AuthError as exc:
                # 401 vs 403 is decided where the check was made, not here.
                return error(exc.status, exc.message, "unauthorized" if exc.status == 401 else "forbidden")

            except ValidationError as exc:
                return bad_request(exc.message, exc.field_errors)

            except psycopg2.IntegrityError as exc:
                # A constraint the application did not pre-check: a duplicate
                # email, or an FK pointing at something that does not exist.
                logger.warning("Integrity error on %s %s: %s", method, path, exc)
                return error(409, _integrity_message(exc), "conflict")

            except psycopg2.Error as exc:
                # Log the detail, return none of it: driver messages can carry
                # SQL text and column names.
                logger.exception("Database error on %s %s", method, path)
                return server_error("A database error occurred")

            except Exception:
                logger.exception("Unhandled error on %s %s", method, path)
                return server_error()

        if matched_path:
            return error(405, f"{method} is not allowed on this path", "method_not_allowed")

        return not_found(f"No route for {method} {path}")


def _integrity_message(exc):
    """Turns a constraint violation into something a user can act on."""
    detail = str(getattr(exc, "pgerror", "") or exc).lower()

    if "unique" in detail or "duplicate key" in detail:
        if "email" in detail:
            return "That email address is already registered"
        return "That record already exists"
    if "foreign key" in detail:
        return "A referenced record does not exist"
    if "check constraint" in detail:
        return "One of the values is outside the allowed range"
    return "The request conflicts with existing data"
