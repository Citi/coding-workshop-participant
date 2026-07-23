#!/usr/bin/env bash
# Script: Initialise the PostgreSQL schema
# Purpose: Apply backend/schema.sql to the local or cloud database
# Usage: ./backend/init-db.sh [--seed]
#
# Options:
#   --seed   also insert a starter Admin user and sample data
#
# Connection settings come from the same POSTGRES_* variables the Lambdas use,
# defaulting to the local development database.

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"

PGHOST="${POSTGRES_HOST:-localhost}"
PGPORT="${POSTGRES_PORT:-5432}"
PGDATABASE="${POSTGRES_NAME:-postgres}"
PGUSER="${POSTGRES_USER:-postgres}"
PGPASSWORD="${POSTGRES_PASS:-postgres123}"
export PGPASSWORD

echo "Applying schema to $PGUSER@$PGHOST:$PGPORT/$PGDATABASE"

psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
     -v ON_ERROR_STOP=1 -q -f "$BACKEND_DIR/schema.sql"

echo "✓ Schema applied"

if [ "${1:-}" = "--seed" ]; then
    if [ ! -f "$BACKEND_DIR/seed.sql" ]; then
        echo "ERROR: $BACKEND_DIR/seed.sql not found"
        exit 1
    fi
    echo "Seeding sample data"
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
         -v ON_ERROR_STOP=1 -q -f "$BACKEND_DIR/seed.sql"
    echo "✓ Seed data applied"
fi
