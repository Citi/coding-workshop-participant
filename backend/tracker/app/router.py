"""
Minimal regex router with per-route authentication requirements.
"""

import re
from dataclasses import dataclass
from typing import Any, Callable, Optional

from psycopg import Connection

from .errors import ApiError, NotFoundError

ROLES = ("admin", "manager", "employee")


@dataclass
class Context:
    """Everything a route handler needs: DB connection, caller and request."""

    conn: Connection
    request: Any  # app.http.Request
    user: Optional[dict] = None

    @property
    def params(self) -> dict[str, str]:
        """Path parameters captured by the route pattern."""
        return self.request.path_params


@dataclass
class Route:
    """A registered route."""

    method: str
    pattern: re.Pattern
    handler: Callable[[Context], Any]
    public: bool


class MethodNotAllowed(ApiError):
    """405 - path exists but not for this HTTP method."""

    status = 405
    code = "method_not_allowed"


class Router:
    """Collects routes and resolves (method, path) to a handler."""

    def __init__(self) -> None:
        """Create an empty router."""
        self.routes: list[Route] = []

    def add(self, method: str, path: str, public: bool = False) -> Callable:
        """Decorator registering ``handler`` for ``method path``; ``{name}`` captures segments."""
        regex = "^" + re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", path) + "$"

        def decorator(handler: Callable[[Context], Any]) -> Callable[[Context], Any]:
            self.routes.append(Route(method.upper(), re.compile(regex), handler, public))
            return handler

        return decorator

    def resolve(self, method: str, path: str) -> tuple[Route, dict[str, str]]:
        """Return the matching route and its captured path params."""
        path_matched = False
        for route in self.routes:
            match = route.pattern.match(path)
            if not match:
                continue
            path_matched = True
            if route.method == method:
                return route, match.groupdict()
        if path_matched:
            raise MethodNotAllowed(f"Method {method} is not allowed for {path}.")
        raise NotFoundError(f"No endpoint for {method} {path}.")


router = Router()
