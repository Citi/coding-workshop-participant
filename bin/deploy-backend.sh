#!/usr/bin/env bash
# Script: Backend Infrastructure Deployment
# Purpose: Deploy backend infrastructure for the coding workshop
# Usage: ./deploy-backend.sh [aws|local]
# Default: aws

set -e

echo "=========================================="
echo "Coding Workshop - Backend Deployment"
echo "=========================================="
echo ""

# Verify required dependencies
tflocal --version > /dev/null 2>&1 || { echo "ERROR: 'tflocal' is missing. Aborting..."; exit 1; }
terraform --version > /dev/null 2>&1 || { echo "ERROR: 'terraform' is missing. Aborting..."; exit 1; }

# Resolve script directory and project root paths
SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." > /dev/null 2>&1 || exit 1; pwd -P)"

# Define configuration file paths
ENVIRONMENT_CONFIG="$PROJECT_ROOT/ENVIRONMENT.config"
BACKEND_CONFIG="$PROJECT_ROOT/BACKEND.config"
INFRA_DIR="$PROJECT_ROOT/infra"

# Determine deployment environment (aws or local)
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
    # Load participant-specific configuration if available
    if [ -f "$ENVIRONMENT_CONFIG" ]; then
        echo "Loading participant environment configuration..."
        source "$ENVIRONMENT_CONFIG"
        echo "  Participant ID: $PARTICIPANT_ID"
        echo "  AWS Profile: $AWS_PROFILE"
    fi

    # Set temporary AWS credentials
    $SCRIPT_DIR/setup-participant.sh
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
if [ -f "$BACKEND_CONFIG" ]; then
    echo "Using backend configuration from backend.config..."
    $TF_CMD init -reconfigure -backend-config="$BACKEND_CONFIG"
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
