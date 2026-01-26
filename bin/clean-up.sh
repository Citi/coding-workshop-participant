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
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." > /dev/null 2>&1 || exit 1; pwd -P)"

# Define configuration file paths
ENVIRONMENT_CONFIG="$PROJECT_ROOT/ENVIRONMENT.config"
INFRA_DIR="$PROJECT_ROOT/infra"

# Set temporary AWS credentials
if [ ! -f "$ENVIRONMENT_CONFIG" ]; then
    $SCRIPT_DIR/setup-participant.sh
fi

# Load participant-specific configuration if available
if [ -f "$ENVIRONMENT_CONFIG" ]; then
    echo "Loading participant environment configuration..."
    source $ENVIRONMENT_CONFIG
fi

# Clean up infrastructure
cd $INFRA_DIR
terraform init -reconfigure -backend-config="bucket=$PARTICIPANT_PROJECT-tfstate-$PARTICIPANT_ID"
terraform destroy -auto-approve
