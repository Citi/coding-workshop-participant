#!/usr/bin/env bash
# Script: Clean Up Deployment
# Purpose: Destroy backend infrastructure for the coding workshop
# Usage: ./clean-up.sh

set -e

echo "=========================================="
echo "Coding Workshop - Clean Up Deployment"
echo "=========================================="
echo ""

# Verify required dependencies
terraform --version > /dev/null 2>&1 || { echo "ERROR: 'terraform' is missing. Aborting..."; exit 1; }

# Resolve script directory and project root paths
SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"

# Clean up infrastructure
cd "$SCRIPT_DIR/../infra/" && terraform destroy -auto-approve
