#!/usr/bin/env bash
# Script: Frontend Application Deployment
# Purpose: Deploy frontend infrastructure for the coding workshop
# Usage: ./deploy-frontend.sh [aws|local]
# Default: aws

set -e

# Usage helper
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0 [aws|local]"
    echo "Deploy frontend application for the coding workshop"
    echo ""
    echo "Arguments:"
    echo "  aws             Build and deploy to AWS S3/CloudFront (default)"
    echo "  local           Skip build (use start-dev.sh for local development)"
    echo ""
    echo "Options:"
    echo "  -h, --help      Show this help message"
    echo ""
    echo "Requirements:"
    echo "  - aws cli installed"
    echo "  - npm installed"
    echo "  - terraform/tflocal installed"
    echo "  - Backend infrastructure deployed first"
    echo ""
    echo "Examples:"
    echo "  $0              # Deploy to AWS"
    echo "  $0 aws          # Deploy to AWS"
    echo "  $0 local        # Local development mode"
    exit 0
fi

echo "=========================================="
echo "Coding Workshop - Frontend Deployment"
echo "=========================================="
echo ""

# Verify required dependencies
aws --version > /dev/null 2>&1 || { echo "ERROR: 'aws' is missing. Aborting..."; exit 1; }
npm --version > /dev/null 2>&1 || { echo "ERROR: 'npm' is missing. Aborting..."; exit 1; }
tflocal --version > /dev/null 2>&1 || { echo "ERROR: 'tflocal' is missing. Aborting..."; exit 1; }
terraform --version > /dev/null 2>&1 || { echo "ERROR: 'terraform' is missing. Aborting..."; exit 1; }

# Resolve script directory and project root paths
SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
PROJECT_ROOT="$(cd $SCRIPT_DIR/.. > /dev/null 2>&1 || exit 1; pwd -P)"

# Define project directories
ENVIRONMENT_CONFIG="$PROJECT_ROOT/ENVIRONMENT.config"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
INFRA_DIR="$PROJECT_ROOT/infra"
ENVIRONMENT=${1:-"aws"}

# Select terraform command (terraform or tflocal)
TF_CMD="terraform"

# Set up PATH and AWS region
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=${AWS_REGION:-us-east-1}

echo "Deploying frontend..."
echo "Environment: $ENVIRONMENT"

# AWS Deployment Configuration
if [ "$ENVIRONMENT" = "aws" ]; then
    # Setup participant if config is missing
    $SCRIPT_DIR/setup-participant.sh

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
        TF_CMD="tflocal"
    else
        # Fallback to terraform with local endpoint
        export AWS_ENDPOINT_URL="http://localhost:4566"
    fi

    # Set dummy AWS credentials for local development
    export AWS_ACCESS_KEY_ID=test
    export AWS_SECRET_ACCESS_KEY=test
    AWS_ENDPOINT="--endpoint-url=http://localhost:4566"
fi

# Change to infrastructure directory
cd "$INFRA_DIR"

# Retrieve S3 bucket name from Terraform outputs
BUCKET_NAME=$($TF_CMD output -raw s3_bucket_name 2>/dev/null || echo "")
echo "Target bucket: $BUCKET_NAME"

# Verify S3 bucket exists (indicates backend infrastructure is deployed)
if [ -z "$BUCKET_NAME" ]; then
    echo "ERROR: Could not get S3 bucket name from Terraform outputs"
    echo "Make sure backend with infrastructure is deployed first:"
    echo "  ./bin/deploy-backend.sh $ENVIRONMENT"
    exit 1
fi

# Retrieve API configuration from Terraform outputs
API_BASE_URL=$($TF_CMD output -raw api_base_url 2>/dev/null || echo "")
echo "API Base URL: $API_BASE_URL"
API_ENDPOINTS=$($TF_CMD output -json api_endpoints 2>/dev/null || echo "{}")
echo "API Endpoints: $API_ENDPOINTS"

# Local Development: Skip frontend build (use start-dev.sh instead)
# AWS Deployment: Build and upload to S3
if [ "$ENVIRONMENT" = "local" ]; then
    echo ""
    echo "======================================================="
    echo "Local: Frontend should be run with './bin/start-dev.sh'"
    echo "======================================================="
    echo "To run frontend locally:"
    echo "  1. Start dev environment: ./bin/start-dev.sh"
    echo "  2. Open browser: http://localhost:3000"
    echo ""
    exit 0
fi

# Build React frontend for production
cd "$FRONTEND_DIR"
echo "Building frontend..."

# Set API environment variables for build (REACT_APP_* for CRA, VITE_* for Vite)
export REACT_APP_API_URL="$API_BASE_URL"
export REACT_APP_API_ENDPOINTS="$API_ENDPOINTS"
export VITE_API_URL="$API_BASE_URL"
export VITE_API_ENDPOINTS="$API_ENDPOINTS"

# Run production build
npm run build

# Prepare S3 upload
echo "Uploading to S3..."

# Detect build output directory (Vite uses dist/, CRA uses build/)
if [ -d "dist" ]; then
    BUILD_DIR="dist"
elif [ -d "build" ]; then
    BUILD_DIR="build"
else
    echo "ERROR: No build output found (expected dist/ or build/)"
    exit 1
fi
echo "Build directory: $BUILD_DIR"

# Remove sample environment file
rm -f $BUILD_DIR/.env.sample

if [ ! -f .env ] && [ -f $BUILD_DIR/.env.local ]; then
    mv -f $BUILD_DIR/.env.local $BUILD_DIR/.env
fi

# Upload built frontend to S3 (with deletion of old files)
aws s3 sync $BUILD_DIR/ s3://$BUCKET_NAME/ --delete $AWS_ENDPOINT

# Invalidate CloudFront cache for AWS deployments
if [ "$ENVIRONMENT" = "aws" ]; then
    cd "$INFRA_DIR"
    
    # Retrieve CloudFront distribution ID from Terraform outputs
    DISTRIBUTION_ID=$($TF_CMD output -raw cloudfront_distribution_id 2>/dev/null || echo "")
    
    # Create cache invalidation for all files
    if [ -n "$DISTRIBUTION_ID" ]; then
        echo "Invalidating CloudFront cache..."
        aws cloudfront create-invalidation \
            --distribution-id "$DISTRIBUTION_ID" \
            --paths "/*"
    fi
fi

echo ""
echo "Frontend deployment complete!"

# Display CloudFront URL
cd "$INFRA_DIR"
URL=$($TF_CMD output -raw website_url 2>/dev/null || echo "")

if [ -n "$URL" ]; then
    echo ""
    echo "CloudFront URL: $URL"
fi
