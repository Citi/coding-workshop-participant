#!/usr/bin/env bash
# Script: Backend Infrastructure Deployment
# Purpose: Deploy backend infrastructure for the coding workshop
# Usage: ./deploy-backend.sh [aws|local]
# Default: aws

set -e

# Usage helper
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0 [aws|local]"
    echo "Deploy backend infrastructure for the coding workshop"
    echo ""
    echo "Arguments:"
    echo "  aws             Deploy to AWS (default)"
    echo "  local           Deploy to LocalStack for development"
    echo ""
    echo "Options:"
    echo "  -h, --help      Show this help message"
    echo ""
    echo "Requirements:"
    echo "  - terraform installed"
    echo "  - tflocal installed (for local development)"
    echo "  - ENVIRONMENT.config file (auto-created for AWS)"
    echo ""
    echo "Examples:"
    echo "  $0              # Deploy to AWS"
    echo "  $0 aws          # Deploy to AWS"
    echo "  $0 local        # Deploy to LocalStack"
    exit 0
fi

echo "=========================================="
echo "Coding Workshop - Backend Deployment"
echo "=========================================="
echo ""

# Verify required dependencies
tflocal --version > /dev/null 2>&1 || { echo "ERROR: 'tflocal' is missing. Aborting..."; exit 1; }
terraform --version > /dev/null 2>&1 || { echo "ERROR: 'terraform' is missing. Aborting..."; exit 1; }

# Resolve script directory and project root paths
SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
PROJECT_ROOT="$(cd $SCRIPT_DIR/.. > /dev/null 2>&1 || exit 1; pwd -P)"

# Define configuration file paths
ENVIRONMENT_CONFIG="$PROJECT_ROOT/ENVIRONMENT.config"
INFRA_DIR="$PROJECT_ROOT/infra"
ENVIRONMENT=${1:-"aws"}

# Select terraform command (terraform or tflocal)
TF_CMD="terraform"

# Set up PATH and AWS region
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=${AWS_REGION:-us-east-1}

echo "Deploying infrastructure..."
echo "Environment: $ENVIRONMENT"

# Change to infrastructure directory
cd "$INFRA_DIR"

# AWS Deployment Configuration
if [ "$ENVIRONMENT" = "aws" ]; then
    echo "Using AWS deployment (terraform)..."

    # Setup participant if config is missing
    if [ ! -f "$ENVIRONMENT_CONFIG" ]; then
        $SCRIPT_DIR/setup-participant.sh
    fi

    # Load participant-specific configuration if available
    if [ -f "$ENVIRONMENT_CONFIG" ]; then
        echo "INFO: Loading participant environment configuration..."
        source $ENVIRONMENT_CONFIG
    else
        echo "WARNING: $ENVIRONMENT_CONFIG is missing"
    fi
else
    # Local development configuration
    if command -v tflocal > /dev/null 2>&1; then
        echo "Using local development (tflocal)..."
        TF_CMD="tflocal"
    else
        echo "Using local development (terraform with AWS_ENDPOINT override)..."
        echo "Note: Install tflocal for easier usage: pip install terraform-local"
        export AWS_ENDPOINT_URL="http://localhost:4566"
    fi

    # Set dummy AWS credentials for local development
    export AWS_ACCESS_KEY_ID=test
    export AWS_SECRET_ACCESS_KEY=test
fi

# Initialize Terraform with backend configuration
if [ -n "$PARTICIPANT_ID" ]; then
    echo "Using custom backend configuration..."
    $TF_CMD init -reconfigure -backend-config="bucket=$PROJECT_NAME-tfstate-$PARTICIPANT_ID"
else
    echo "WARNING: No backend.config found. Using default backend configuration."
    echo "For multi-participant workshops, run: ./bin/setup-participant.sh"
    $TF_CMD init -reconfigure
fi

# Apply Terraform configuration automatically
$TF_CMD apply -auto-approve
echo "Infrastructure deployment complete!"

# Display API endpoint
if [ -n "$API_BASE_URL" ]; then
    echo ""
    echo "API Base URL: $API_BASE_URL"
fi
if [ -n "$API_ENDPOINTS" ]; then
    echo ""
    echo "API Endpoints: $API_ENDPOINTS"
fi
