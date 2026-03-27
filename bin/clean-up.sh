#!/usr/bin/env bash
# Script: Clean Up Deployment
# Purpose: Destroy backend infrastructure for the coding workshop
# Usage: ./clean-up.sh

set -e

# Usage helper
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0"
    echo "Destroy workshop infrastructure using Terraform"
    echo ""
    echo "Description:"
    echo "  Loads participant configuration and destroys all"
    echo "  Terraform-managed infrastructure"
    echo ""
    echo "Options:"
    echo "  -h, --help      Show this help message"
    echo ""
    echo "Requirements:"
    echo "  - terraform installed"
    echo "  - ENVIRONMENT.config file (auto-created if missing)"
    exit 0
fi

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

# Load participant-specific configuration if available
if [ -f "$ENVIRONMENT_CONFIG" ]; then
    echo "INFO: Loading participant environment configuration..."
    source $ENVIRONMENT_CONFIG
fi

# Create default configuration if it doesn't exist
if [ -z "$PARTICIPANT_ID" ]; then
    $SCRIPT_DIR/setup-participant.sh
    source $ENVIRONMENT_CONFIG
fi

if [ -z "$AWS_S3_BUCKET" ]; then
    echo "ERROR: AWS_S3_BUCKET not defined in ENVIRONMENT.config"
    exit 1
fi

# Backup everything under PROJECT_ROOT
cd $PROJECT_ROOT
zip -r ../backup.zip . -x ".git*" "node_modules*" "**/node_modules*" ".venv*" "**/.venv*" "*py*cache*" "**/*py*cache*" "**/builds*" "**/.terraform*" "*.zip"
aws s3 mv ../backup.zip s3://$AWS_S3_BUCKET/backup/backup-$PARTICIPANT_ID.zip

# Clean up infrastructure
cd $INFRA_DIR
terraform init -reconfigure -backend-config="bucket=$AWS_S3_BUCKET"
terraform destroy -auto-approve
