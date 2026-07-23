"""
Shared backend modules.

This is the canonical copy. `backend/sync-shared.sh` copies this package into
each service directory (as `<service>/_shared/`) because Terraform packages
each Lambda from its own folder and cannot reach a sibling. Edit here, never in
a service's copy -- those are build artifacts and are gitignored.

Services import from it as a package:

    from _shared.auth import authenticate, require_permission
    from _shared.responses import ok, created, not_found
"""
