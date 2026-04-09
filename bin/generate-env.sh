#!/usr/bin/env bash
# Script: Generate Frontend Environment Configuration
# Purpose: Generate .env.local file for React frontend with API configuration
# Usage: ./generate-env.sh

set -e

# Usage helper
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0"
    echo "Generate .env.local file for React frontend with API configuration"
    echo ""
    echo "Description:"
    echo "  Retrieves API configuration from Terraform outputs and"
    echo "  generates .env.local file for React development"
    echo ""
    echo "Options:"
    echo "  -h, --help      Show this help message"
    echo ""
    echo "Requirements:"
    echo "  - terraform installed"
    echo "  - Backend infrastructure deployed"
    echo ""
    echo "Output:"
    echo "  Creates frontend/.env.local with API configuration"
    exit 0
fi

echo "======================================"
echo "Coding Workshop - Generate Environment"
echo "======================================"
echo ""

# Resolve script directory and project root paths
SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
PROJECT_ROOT="$(cd $SCRIPT_DIR/.. > /dev/null 2>&1 || exit 1; pwd -P)"

# Define project directories and output file
FRONTEND_DIR="$PROJECT_ROOT/frontend"
INFRA_DIR="$PROJECT_ROOT/infra"
ENVIRONMENT_CONFIG="$FRONTEND_DIR/.env.local"

# Change to infrastructure directory to retrieve Terraform outputs
cd "$INFRA_DIR"

# Detect environment (local with LocalStack or AWS)
if command -v tflocal > /dev/null 2>&1 && tflocal output -raw api_base_url >/dev/null 2>&1; then
    # LocalStack available and configured for local development
    ENVIRONMENT="local"
    TF_CMD="tflocal"

    # Set LocalStack AWS credentials
    export AWS_REGION=us-east-1
    export AWS_ACCESS_KEY_ID=test
    export AWS_SECRET_ACCESS_KEY=test
else
    # AWS deployment environment
    ENVIRONMENT="aws"
    TF_CMD="terraform"
fi

# Retrieve API base URL from Terraform outputs
API_BASE_URL=$($TF_CMD output -raw api_base_url 2>/dev/null || echo "ERROR")

# Verify Terraform output was retrieved successfully
if [ "$API_BASE_URL" = "ERROR" ]; then
    echo "WARNING: Could not get api_base_url from Terraform outputs"
    echo "Make sure infrastructure is deployed first with: ./bin/deploy-backend.sh"
    exit 1
fi

# Handle empty API base URL (valid for local development - uses direct Lambda URLs)
if [ -z "$API_BASE_URL" ]; then
    echo "API Base URL: (empty - using direct Lambda Function URLs)"
    API_BASE_URL="http://localhost:3001"
else
    echo "API Base URL: $API_BASE_URL"
fi

# Retrieve API endpoints configuration from Terraform outputs
API_ENDPOINTS=$($TF_CMD output -json api_endpoints 2>/dev/null || echo "{}")

# Generate .env.local configuration file for React frontend
cat > "$ENVIRONMENT_CONFIG" << EOF
# Auto-generated environment file
# Generated on: $(date)
# Environment: $ENVIRONMENT
REACT_APP_API_URL=$API_BASE_URL
REACT_APP_API_ENDPOINTS='$API_ENDPOINTS'
VITE_API_URL=$API_BASE_URL
VITE_API_ENDPOINTS='$API_ENDPOINTS'
EOF

echo ""
echo "Contents:"
cat "$ENVIRONMENT_CONFIG"
echo ""
echo "✓ Created $ENVIRONMENT_CONFIG"
echo ""
