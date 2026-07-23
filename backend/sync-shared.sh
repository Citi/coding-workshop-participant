#!/usr/bin/env bash
# Script: Sync shared backend modules into each service
# Purpose: Copy backend/_shared into every deployable service directory
# Usage: ./backend/sync-shared.sh
#
# Why this exists:
#   Terraform packages each Lambda from its own directory only
#   (infra/locals.tf -> source_path = backend/<service>), so a service cannot
#   import from a sibling folder at runtime. backend/_shared is the canonical
#   copy that gets edited; the per-service copies are build artifacts and are
#   gitignored.
#
#   Run this after changing anything under backend/_shared, and before
#   ./bin/start-dev.sh or ./bin/deploy-backend.sh.

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
SHARED_DIR="$BACKEND_DIR/_shared"

if [ ! -d "$SHARED_DIR" ]; then
    echo "ERROR: $SHARED_DIR does not exist"
    exit 1
fi

echo "Syncing shared modules from $SHARED_DIR"

synced=0
for service_dir in "$BACKEND_DIR"/*/; do
    service="$(basename "$service_dir")"

    # Underscore-prefixed folders are excluded from deployment by Terraform.
    [[ "$service" == _* ]] && continue

    # Only real services -- a directory becomes a Lambda by having function.py.
    [ -f "$service_dir/function.py" ] || continue

    rm -rf "${service_dir:?}/_shared"
    cp -R "$SHARED_DIR" "$service_dir/_shared"

    # schema.sql travels with the shared package so a Lambda can bootstrap the
    # database from inside the VPC. Aurora is not publicly accessible, so psql
    # from a workstation is not an option in the cloud.
    cp "$BACKEND_DIR/schema.sql" "$service_dir/_shared/schema.sql"
    cp "$BACKEND_DIR/seed.sql" "$service_dir/_shared/seed.sql"

    # Drop caches so a stale .pyc never ships in the deployment package.
    find "$service_dir/_shared" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true

    echo "  ✓ $service"
    synced=$((synced + 1))
done

if [ "$synced" -eq 0 ]; then
    echo "  (no services found — create backend/<name>/function.py first)"
else
    echo "Synced into $synced service(s)."
fi
