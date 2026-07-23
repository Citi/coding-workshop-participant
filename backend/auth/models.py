"""
Validation specs and row serialisers for the auth service.

Keeping the shapes here means routes.py stays about HTTP and service.py stays
about SQL -- neither has to know what a valid password looks like.
"""

from _shared.auth import (
    ADMIN,
    EMPLOYEE,
    PROJECT_MANAGER,
    ROLES,
    STAKEHOLDER,
    TEAM_LEADER,
)

# Domain the company owns. Only addresses here earn write access on signup.
CORPORATE_DOMAIN = "acme.com"

# Suffixes on the local part that mark seniority, e.g. "ada.mr@acme.com".
# Checked before the plain-employee fallback, since "ada.mr" also matches the
# general corporate rule.
#
# SECURITY: ".admin" grants full system access, including user management, and
# /auth/register is a public unauthenticated endpoint with no proof that the
# registrant owns the address. Anyone who can reach the API can therefore make
# themselves an Admin by choosing the right string. This is acceptable for a
# workshop deployment and must not ship as-is; see role_for_email for the fix.
ROLE_SUFFIXES = (
    (".admin", ADMIN),
    (".mr", PROJECT_MANAGER),
    (".tl", TEAM_LEADER),
)


def role_for_email(email):
    """The role a self-service signup is granted, derived from the address.

        ada.admin@acme.com -> ADMIN
        ada.mr@acme.com    -> PROJECT_MANAGER
        ada.tl@acme.com    -> TEAM_LEADER
        ada@acme.com       -> EMPLOYEE
        ada@gmail.com      -> STAKEHOLDER

    Anything outside the corporate domain falls back to STAKEHOLDER --
    read-only. That is the safe default: an address we do not recognise must
    never earn write access by accident, which is why a lookalike such as
    "ada.admin@gmail.com" gets nothing.

    SECURITY: this trusts the address, and nothing proves the registrant owns
    it. Since ".admin" now grants user management, self-registration is an
    open door to full access. Closing it needs one of:

      * email verification -- issue the account as STAKEHOLDER and only apply
        the derived role once a link sent to the address is followed;
      * federated sign-in -- take the role from an identity provider that has
        already verified the domain;
      * or dropping ADMIN from this table entirely, leaving it grantable only
        by an existing Admin through PATCH /users/{id}/role.

    The workshop has no mail transport, so the role is granted at registration
    and an Admin can correct it afterwards.
    """
    local, _, domain = (email or "").strip().lower().rpartition("@")

    if domain == CORPORATE_DOMAIN:
        for suffix, role in ROLE_SUFFIXES:
            if local.endswith(suffix):
                return role
        return EMPLOYEE

    return STAKEHOLDER

# Long enough to resist guessing, without a complexity rule that pushes people
# towards "Passw0rd!". Length is the property that actually matters.
MIN_PASSWORD_LENGTH = 8

REGISTER_SPEC = {
    "email": {"type": "email", "required": True, "max_length": 255},
    "password": {"type": "string", "required": True, "min_length": MIN_PASSWORD_LENGTH, "max_length": 128},
    "fullName": {"type": "string", "required": True, "min_length": 2, "max_length": 150},
}

LOGIN_SPEC = {
    "email": {"type": "email", "required": True},
    # No length rule: an old password that predates a policy change should
    # still be able to sign in and be changed.
    "password": {"type": "string", "required": True},
}

REFRESH_SPEC = {
    "refreshToken": {"type": "string", "required": True},
}

CHANGE_PASSWORD_SPEC = {
    "currentPassword": {"type": "string", "required": True},
    "newPassword": {"type": "string", "required": True, "min_length": MIN_PASSWORD_LENGTH, "max_length": 128},
}

# Admin-managed user creation: unlike self-registration, the role is chosen.
CREATE_USER_SPEC = {
    **REGISTER_SPEC,
    "role": {"type": "enum", "required": True, "values": ROLES},
}

UPDATE_USER_SPEC = {
    "fullName": {"type": "string", "min_length": 2, "max_length": 150},
    "role": {"type": "enum", "values": ROLES},
    "isActive": {"type": "boolean"},
}

UPDATE_ROLE_SPEC = {
    "role": {"type": "enum", "required": True, "values": ROLES},
}


def serialise_user(row):
    """Maps a DB row to the JSON the frontend expects.

    password_hash is never included -- not in a list, not in a detail view, not
    on the record returned straight after creation.
    """
    if row is None:
        return None

    return {
        "id": str(row["id"]),
        "email": row["email"],
        "fullName": row["full_name"],
        "role": row["role"],
        "isActive": row["is_active"],
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }
