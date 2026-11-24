#!/usr/bin/env bash
# Script: Database Task Runner
# Purpose: Run a database task inside the deployed portfolio Lambda (direct invoke, IAM only)
# Usage: ./db-task.sh <local|aws> <migrate|seed|reset>
# seed and reset read the demo password from SEED_PASSWORD (8-72 bytes). It is never printed.

set -euo pipefail

usage() {
    echo "Usage: $0 <local|aws> <migrate|seed|reset>" >&2
    echo "Run '$0 --help' for details." >&2
    exit 2
}

# Usage helper
if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    echo "Usage: $0 <local|aws> <migrate|seed|reset>"
    echo "Run a database task inside the deployed portfolio Lambda"
    echo ""
    echo "Arguments:"
    echo "  local           Use the Lambda in LocalStack (started by ./bin/start-dev.sh)"
    echo "  aws             Use the Lambda in AWS (deployed by ./bin/deploy-backend.sh)"
    echo "  migrate         Apply schema.sql (safe to repeat)"
    echo "  seed            Insert the demo data (skipped if any department exists)"
    echo "  reset           Empty every table, restart ids, then seed again"
    echo ""
    echo "Environment:"
    echo "  SEED_PASSWORD   Demo password for seed and reset (8-72 bytes). Set it without echoing:"
    echo "                  read -rs SEED_PASSWORD && export SEED_PASSWORD"
    echo ""
    echo "Examples:"
    echo "  $0 local migrate"
    echo "  $0 local seed"
    echo "  $0 aws reset"
    exit 0
fi

MODE="${1:-}"
TASK="${2:-}"
[[ "$MODE" =~ ^(local|aws)$ ]] || usage
[[ "$TASK" =~ ^(migrate|seed|reset)$ ]] || usage

# Check the password first, before any credentials are fetched; never print it
if [ "$TASK" != "migrate" ] && [ -z "${SEED_PASSWORD:-}" ]; then
    echo "ERROR: Set SEED_PASSWORD first, for example: read -rs SEED_PASSWORD && export SEED_PASSWORD" >&2
    exit 2
fi

# Set up PATH and AWS region (as deploy-backend.sh does)
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=${AWS_REGION:-us-east-1}

# Verify required dependencies
aws --version > /dev/null 2>&1 || { echo "ERROR: 'aws' is missing. Aborting..." >&2; exit 1; }
python3 --version > /dev/null 2>&1 || { echo "ERROR: 'python3' is missing. Aborting..." >&2; exit 1; }

# Resolve script directory and project root paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" > /dev/null 2>&1 && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." > /dev/null 2>&1 && pwd -P)"
ENVIRONMENT_CONFIG="$PROJECT_ROOT/ENVIRONMENT.config"

# Credentials per mode, matching deploy-backend.sh
if [ "$MODE" = "aws" ]; then
    # A LocalStack endpoint left in the shell must not redirect an AWS task
    unset AWS_ENDPOINT_URL AWS_ENDPOINT_URL_S3

    # Setup participant (refreshes the temporary credentials in ENVIRONMENT.config)
    "$SCRIPT_DIR/setup-participant.sh" > /dev/null || {
        echo "ERROR: setup-participant.sh failed; run it directly to see why. Aborting..." >&2
        exit 1
    }

    # Load participant-specific configuration if available
    if [ -f "$ENVIRONMENT_CONFIG" ]; then
        # shellcheck disable=SC1090
        source "$ENVIRONMENT_CONFIG"
    else
        echo "WARN: $ENVIRONMENT_CONFIG is missing" >&2
    fi
else
    # Local development configuration: override credentials for LocalStack
    export AWS_ENDPOINT_URL="http://localhost.localstack.cloud:4566"
    export AWS_ENDPOINT_URL_S3="http://s3.localhost.localstack.cloud:4566"
    export AWS_ACCESS_KEY_ID=test
    export AWS_SECRET_ACCESS_KEY=test
    export AWS_REGION=us-east-1
    unset AWS_SESSION_TOKEN
fi

# Find the portfolio Lambda. Terraform names it <project>-portfolio-<app code>
# (infra/lambda.tf; the app code is trimmed as in infra/locals.tf).
PREFIX="${TF_VAR_aws_project:-coding-workshop}-portfolio-"
APP_CODE="$(printf '%s' "${TF_VAR_aws_app_code:-}" | tr -d '[:space:]')"
FUNCTION_NAME=""
if [ "$MODE" = "aws" ] && [ -n "$APP_CODE" ]; then
    # Build the name directly: the workshop role may not call lambda:ListFunctions
    FUNCTION_NAME="$PREFIX$APP_CODE"
else
    CANDIDATES="$(aws lambda list-functions \
        --query "Functions[?starts_with(FunctionName, '$PREFIX')].FunctionName" \
        --output text | tr '\t' '\n' | sed '/^$/d; /^None$/d')" || {
        echo "ERROR: Cannot list Lambda functions (see above). Set TF_VAR_aws_app_code to your app code." >&2
        exit 1
    }
    if [ -n "$APP_CODE" ] && grep -qxF -- "$PREFIX$APP_CODE" <<< "$CANDIDATES"; then
        # This participant's own function
        FUNCTION_NAME="$PREFIX$APP_CODE"
    elif [ "$(grep -c . <<< "$CANDIDATES" || true)" = "1" ] && { [ "$MODE" = "local" ] || [ -z "$APP_CODE" ]; }; then
        # The only portfolio function (never another participant's when our app code is known)
        FUNCTION_NAME="$CANDIDATES"
    fi
    if [ -z "$FUNCTION_NAME" ] && [ -z "$CANDIDATES" ]; then
        echo "ERROR: Portfolio Lambda not found. Deploy the backend first." >&2
        exit 1
    elif [ -z "$FUNCTION_NAME" ]; then
        echo "ERROR: Cannot tell which portfolio Lambda is yours (found: $(paste -sd ' ' <<< "$CANDIDATES"))." >&2
        echo "ERROR: Deploy the backend first, or set TF_VAR_aws_app_code to your app code." >&2
        exit 1
    fi
fi

PAYLOAD_FILE="$(mktemp)"
OUT_FILE="$(mktemp)"
META_FILE="$(mktemp)"
trap 'rm -f "$PAYLOAD_FILE" "$OUT_FILE" "$META_FILE"' EXIT

# Build the payload with Python so the password is JSON-escaped and never echoed
TASK="$TASK" python3 - > "$PAYLOAD_FILE" <<'PY'
import json
import os

payload = {"task": os.environ["TASK"]}
if payload["task"] != "migrate":
    payload["password"] = os.environ["SEED_PASSWORD"]
print(json.dumps(payload))
PY

echo "INFO: Running '$TASK' in $FUNCTION_NAME ($MODE)..." >&2
aws lambda invoke --function-name "$FUNCTION_NAME" \
    --payload "fileb://$PAYLOAD_FILE" --cli-read-timeout 300 "$OUT_FILE" > "$META_FILE" || {
    echo "ERROR: The invoke was refused (see above). If it is an IAM AccessDenied error, direct invoke is not allowed for this role." >&2
    echo "ERROR: If it is ResourceNotFoundException, deploy the backend first: ./bin/deploy-backend.sh" >&2
    exit 1
}

cat "$OUT_FILE"; echo
if grep -q '"FunctionError"' "$META_FILE"; then
    echo "ERROR: Task failed. See the Lambda logs: aws logs tail /aws/lambda/$FUNCTION_NAME" >&2
    exit 1
fi
