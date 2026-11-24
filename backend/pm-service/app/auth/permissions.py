"""The single source of truth for role-based access control.

Permissions are strings ``"<resource>:<action>"``. Routes declare the permission they
need; the dispatcher checks it; ``GET /auth/me`` exposes the list to the frontend so the
UI can hide actions the user may not perform.

| Role        | Access                                              |
|-------------|-----------------------------------------------------|
| admin       | everything, including user and role management      |
| manager     | everything except users and roles                   |
| contributor | read + create + update (no delete), no users        |
| viewer      | read-only                                           |
"""

ROLES = ("admin", "manager", "contributor", "viewer")
DOMAIN_RESOURCES = ("projects", "deliverables", "resources", "allocations", "expenses")
ALL_ACTIONS = ("read", "create", "update", "delete")


def _grant(resources, actions) -> frozenset:
    return frozenset(f"{resource}:{action}" for resource in resources for action in actions)


_DASHBOARD = frozenset({"dashboard:read"})

ROLE_PERMISSIONS = {
    "admin": _grant(DOMAIN_RESOURCES, ALL_ACTIONS) | _grant(("users",), ALL_ACTIONS) | _DASHBOARD,
    "manager": _grant(DOMAIN_RESOURCES, ALL_ACTIONS) | _DASHBOARD,
    "contributor": _grant(DOMAIN_RESOURCES, ("read", "create", "update")) | _DASHBOARD,
    "viewer": _grant(DOMAIN_RESOURCES, ("read",)) | _DASHBOARD,
}


def has_permission(role: str, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, frozenset())


def permissions_for(role: str) -> list:
    return sorted(ROLE_PERMISSIONS.get(role, frozenset()))
