"""Minimal router: maps (method, path pattern) to a handler plus its access rules."""

import re
from collections.abc import Callable
from dataclasses import dataclass

from app.core.errors import MethodNotAllowedError, NotFoundError, ValidationError

_PARAM_PATTERN = re.compile(r"\{(\w+)\}")
_DIGITS = re.compile(r"[0-9]+")
MAX_DB_INT = 2_147_483_647


@dataclass(frozen=True)
class Route:
    method: str
    pattern: str
    regex: re.Pattern
    handler: Callable
    permission: str | None
    public: bool
    uses_db: bool


class Router:
    """Routes are registered by each domain's ``routes.register(router)``.

    ``permission`` is checked centrally by the dispatcher (see ``app.auth.permissions``);
    ``public=True`` skips authentication (login, refresh, health check).
    """

    def __init__(self):
        self._routes: list[Route] = []

    def add(self, method, pattern, handler, *, permission=None, public=False, uses_db=True):
        normalized = pattern.rstrip("/") or "/"
        regex = re.compile("^" + _PARAM_PATTERN.sub(r"(?P<\1>[^/]+)", normalized) + "$")
        self._routes.append(Route(method.upper(), normalized, regex, handler, permission, public, uses_db))
        return handler

    def get(self, pattern, **options):
        return lambda handler: self.add("GET", pattern, handler, **options)

    def post(self, pattern, **options):
        return lambda handler: self.add("POST", pattern, handler, **options)

    def put(self, pattern, **options):
        return lambda handler: self.add("PUT", pattern, handler, **options)

    def delete(self, pattern, **options):
        return lambda handler: self.add("DELETE", pattern, handler, **options)

    @property
    def routes(self) -> list[Route]:
        return list(self._routes)

    def resolve(self, method: str, path: str):
        """Return ``(route, path_params)``; 404 for unknown paths, 405 for a wrong method."""
        path_exists = False
        for route in self._routes:
            match = route.regex.match(path)
            if not match:
                continue
            path_exists = True
            if route.method == method.upper():
                return route, _convert_params(match.groupdict())
        if path_exists:
            raise MethodNotAllowedError(f"Method {method.upper()} is not allowed for {path}")
        raise NotFoundError(f"Route {method.upper()} {path} not found")


def _convert_params(raw: dict) -> dict:
    """``id`` and ``*_id`` path parameters must be positive integers (400 otherwise)."""
    params = {}
    for name, value in raw.items():
        if name == "id" or name.endswith("_id"):
            if not _DIGITS.fullmatch(value) or not 0 < int(value) <= MAX_DB_INT:
                raise ValidationError(f"Invalid {name} in URL", details={name: "Must be a positive integer"})
            params[name] = int(value)
        else:
            params[name] = value
    return params
