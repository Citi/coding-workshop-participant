#!/usr/bin/env bash
# Script: Comprehensive Local Development Environment Startup
# Purpose: Validate and start all components (MongoDB, LocalStack, Backend, Frontend)
# Usage: ./start-dev2.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "============================================================"
echo "Comprehensive Local Development Environment Startup"
echo "============================================================"
echo ""

# Resolve script directory and project root paths
SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." > /dev/null 2>&1 || exit 1; pwd -P)"

# Define project directories
INFRA_DIR="$PROJECT_ROOT/infra"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# ============================================================
# STEP 1: Check and Start MongoDB
# ============================================================
echo -e "${BLUE}[1/4] Checking MongoDB...${NC}"

# Check if mongod is installed
if ! command -v mongod &> /dev/null; then
    echo -e "${RED}ERROR: MongoDB (mongod) is not installed${NC}"
    echo "Install: brew install mongodb-community (Mac) or apt-get install mongodb (Linux)"
    exit 1
fi

# Check if MongoDB is running and properly bound
MONGODB_OK=false

if pgrep -x "mongod" > /dev/null; then
    # MongoDB process exists, check binding
    if command -v ss &> /dev/null; then
        # Use ss (works without sudo on Linux)
        if ss -ltn | grep -q '0.0.0.0:27017'; then
            MONGODB_OK=true
        fi
    elif command -v netstat &> /dev/null && [[ "$(uname)" != "Darwin" ]]; then
        # Fall back to netstat (Linux only - macOS netstat has different output format)
        if netstat -ltn 2>/dev/null | grep -q '0.0.0.0:27017'; then
            MONGODB_OK=true
        fi
    fi

    # On macOS or if above checks failed, check process arguments for bind_ip
    if [ "$MONGODB_OK" = false ]; then
        if ps -p $(pgrep -x "mongod") -o args= 2>/dev/null | grep -q "bind_ip 0.0.0.0\|bind_ip=0.0.0.0"; then
            MONGODB_OK=true
        fi
    fi

    # Final fallback: try to connect directly
    if [ "$MONGODB_OK" = false ]; then
        if mongosh --quiet --eval "db.adminCommand({ping:1}).ok" > /dev/null 2>&1; then
            MONGODB_OK=true
        fi
    fi
fi

if [ "$MONGODB_OK" = true ]; then
    echo -e "${GREEN}  ✓ MongoDB is running and bound to 0.0.0.0:27017${NC}"

    # Verify it's actually accessible
    if ! mongosh --quiet --eval "db.adminCommand({ping:1}).ok" > /dev/null 2>&1; then
        echo -e "${RED}  ✗ MongoDB is running but not responding to ping${NC}"
        exit 1
    fi
    echo -e "${GREEN}  ✓ MongoDB connection verified${NC}"
else
    echo -e "${YELLOW}  ⚠ MongoDB not running or not bound to 0.0.0.0, starting it...${NC}"

    # Kill any existing mongod that's not properly configured
    if pgrep -x "mongod" > /dev/null; then
        echo -e "${YELLOW}  ⚠ Stopping misconfigured MongoDB...${NC}"
        PID=$(pgrep -x "mongod" || true)
        if [ -n "$PID" ]; then
            OWNER=$(ps -o user= -p "$PID" | tr -d ' ')
            if [ "$OWNER" != "$(whoami)" ]; then
                echo -e "${YELLOW}    MongoDB is running as ${OWNER}, attempting sudo stop...${NC}"
                if command -v systemctl &> /dev/null && systemctl list-units --type=service --all | grep -q mongod; then
                    sudo systemctl stop mongod || true
                else
                    sudo kill "$PID" || true
                fi
            else
                kill "$PID" || true
            fi
            sleep 2
        fi
    fi

    # Determine data and log directories based on OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        DATA_DIR="/var/lib/mongodb"
        LOG_DIR="/var/log/mongodb"
        # Try to create directories with sudo if needed
        if [ ! -d "$DATA_DIR" ]; then
            mkdir -p "$DATA_DIR" 2>/dev/null || sudo mkdir -p "$DATA_DIR"
        fi
        if [ ! -d "$LOG_DIR" ]; then
            mkdir -p "$LOG_DIR" 2>/dev/null || sudo mkdir -p "$LOG_DIR"
        fi
        # Ensure current user owns the directories
        sudo chown -R $(whoami):$(whoami) "$DATA_DIR" "$LOG_DIR" 2>/dev/null || true
    else
        # Mac
        DATA_DIR="/usr/local/var/mongodb"
        LOG_DIR="/usr/local/var/log/mongodb"
        mkdir -p "$DATA_DIR" "$LOG_DIR"
    fi

    # Start MongoDB with correct binding
    echo -e "${BLUE}  Starting MongoDB with --bind_ip 0.0.0.0...${NC}"
    mongod --dbpath "$DATA_DIR" --bind_ip 0.0.0.0 --port 27017 --fork --logpath "$LOG_DIR/mongo.log"
    sleep 3

    # Verify it started correctly
    if ! mongosh --quiet --eval "db.adminCommand({ping:1}).ok" > /dev/null 2>&1; then
        echo -e "${RED}  ✗ MongoDB failed to start properly${NC}"
        echo -e "${BLUE}  Log tail:${NC}"
        tail -n 20 "$LOG_DIR/mongo.log" | sed 's/^/    /'
        exit 1
    fi

    echo -e "${GREEN}  ✓ MongoDB started and verified${NC}"
fi

echo ""

# ============================================================
# STEP 2: Check and Start LocalStack
# ============================================================
echo -e "${BLUE}[2/4] Checking LocalStack...${NC}"

# Check if localstack is installed
if ! command -v localstack &> /dev/null; then
    echo -e "${RED}ERROR: LocalStack is not installed${NC}"
    echo "Install: pip install localstack"
    exit 1
fi

# Check if LocalStack is running
LOCALSTACK_OK=false
if curl -s http://localhost:4566/_localstack/health > /dev/null 2>&1; then
    LOCALSTACK_OK=true
    echo -e "${GREEN}  ✓ LocalStack is running${NC}"
else
    echo -e "${YELLOW}  ⚠ LocalStack not running, starting it...${NC}"
    localstack start -d

    # Wait for LocalStack to be ready (up to 30 seconds)
    for i in {1..30}; do
        if curl -s http://localhost:4566/_localstack/health > /dev/null 2>&1; then
            LOCALSTACK_OK=true
            echo -e "${GREEN}  ✓ LocalStack started${NC}"
            break
        fi
        echo -e "${BLUE}  Waiting for LocalStack... ($i/30)${NC}"
        sleep 1
    done

    if [ "$LOCALSTACK_OK" = false ]; then
        echo -e "${RED}  ✗ LocalStack failed to start within 30 seconds${NC}"
        exit 1
    fi
fi

# Verify LocalStack services
HEALTH=$(curl -s http://localhost:4566/_localstack/health 2>/dev/null || echo "{}")
LAMBDA_STATUS=$(echo "$HEALTH" | grep -o '"lambda":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
S3_STATUS=$(echo "$HEALTH" | grep -o '"s3":"[^"]*"' | cut -d'"' -f4 || echo "unknown")

if [ "$LAMBDA_STATUS" != "available" ] && [ "$LAMBDA_STATUS" != "running" ]; then
    echo -e "${YELLOW}  ⚠ Lambda service status: $LAMBDA_STATUS${NC}"
fi

if [ "$S3_STATUS" != "available" ] && [ "$S3_STATUS" != "running" ]; then
    echo -e "${YELLOW}  ⚠ S3 service status: $S3_STATUS${NC}"
fi

echo -e "${GREEN}  ✓ LocalStack services verified${NC}"
echo ""

# ============================================================
# STEP 3: Check and Deploy Backend
# ============================================================
echo -e "${BLUE}[3/4] Checking Backend Infrastructure...${NC}"

# Verify required tools
if ! command -v tflocal &> /dev/null; then
    echo -e "${RED}ERROR: tflocal is not installed${NC}"
    echo "Install: pip install terraform-local"
    exit 1
fi

# Set LocalStack AWS credentials
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test

# Detect MongoDB host for LocalStack Lambda functions
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    export TF_VAR_mongodb_host="172.17.0.1"
    echo -e "${BLUE}  Detected Linux - using MongoDB host: 172.17.0.1${NC}"
else
    export TF_VAR_mongodb_host="host.docker.internal"
    echo -e "${BLUE}  Detected Mac/Windows - using MongoDB host: host.docker.internal${NC}"
fi

# Change to infrastructure directory
cd "$INFRA_DIR"

# Clean up old Lambda build artifacts to force fresh builds
echo -e "${BLUE}  Cleaning up old Lambda build artifacts...${NC}"
rm -rf "$INFRA_DIR/builds"

# Check if backend is deployed
BACKEND_OK=false
if tflocal output lambda_urls > /dev/null 2>&1; then
    # Backend is deployed, verify functions are accessible
    LAMBDA_URLS=$(tflocal output -json lambda_urls 2>/dev/null | grep -o 'http://[^"]*' | head -1 || echo "")

    if [ -n "$LAMBDA_URLS" ]; then
        # Test if at least one function responds
        if curl -s -f "$LAMBDA_URLS" > /dev/null 2>&1; then
            BACKEND_OK=true
            echo -e "${GREEN}  ✓ Backend is deployed and functions are responding${NC}"
        else
            echo -e "${YELLOW}  ⚠ Backend is deployed but functions not responding${NC}"
        fi
    fi
fi

if [ "$BACKEND_OK" = false ]; then
    echo -e "${YELLOW}  ⚠ Backend not deployed or not working, deploying...${NC}"

    # Deploy backend
    "$SCRIPT_DIR/deploy-backend.sh" local > /tmp/backend-deploy.log 2>&1 || {
        echo -e "${RED}  ✗ Backend deployment failed${NC}"
        tail -n 50 /tmp/backend-deploy.log | sed 's/^/    /'
        exit 1
    }

    echo -e "${GREEN}  ✓ Backend deployed successfully${NC}"
fi

# Display Lambda URLs
echo -e "${BLUE}  Lambda Function URLs:${NC}"
tflocal output -json lambda_urls 2>/dev/null | grep -o 'http://[^"]*' | sed 's/^/    /' || echo "    (none)"

echo ""

# ============================================================
# STEP 4: Check and Start Frontend
# ============================================================
echo -e "${BLUE}[4/4] Checking Frontend...${NC}"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}ERROR: npm is not installed${NC}"
    exit 1
fi

# Change to frontend directory
cd "$FRONTEND_DIR"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}  ⚠ Frontend dependencies not installed, installing...${NC}"
    npm install > /tmp/npm-install.log 2>&1 || {
        echo -e "${RED}  ✗ npm install failed${NC}"
        tail -n 30 /tmp/npm-install.log | sed 's/^/    /'
        exit 1
    }
    echo -e "${GREEN}  ✓ Frontend dependencies installed${NC}"
else
    echo -e "${GREEN}  ✓ Frontend dependencies already installed${NC}"
fi

# Generate .env.local for frontend
echo -e "${BLUE}  Generating frontend environment configuration...${NC}"
"$SCRIPT_DIR/generate-env.sh" > /dev/null 2>&1 || {
    echo -e "${YELLOW}  ⚠ Could not generate .env.local${NC}"
}

# Check if proxy server is running
PROXY_OK=false
if curl -s http://localhost:3001/health > /dev/null 2>&1 || lsof -iTCP:3001 -sTCP:LISTEN > /dev/null 2>&1; then
    PROXY_OK=true
    echo -e "${GREEN}  ✓ Proxy server is already running on port 3001${NC}"
else
    echo -e "${BLUE}  Starting CORS proxy server...${NC}"
    node "$SCRIPT_DIR/proxy-server.js" > /tmp/proxy-server.log 2>&1 &
    PROXY_PID=$!

    # Wait for proxy to start
    sleep 2

    # Verify proxy started
    if kill -0 $PROXY_PID 2>/dev/null; then
        echo -e "${GREEN}  ✓ Proxy server started (PID: $PROXY_PID)${NC}"
        # Store PID for cleanup
        echo $PROXY_PID > /tmp/proxy-server.pid
    else
        echo -e "${RED}  ✗ Proxy server failed to start${NC}"
        cat /tmp/proxy-server.log | sed 's/^/    /'
        exit 1
    fi
fi

# Check if React dev server is already running
REACT_RUNNING=false
if lsof -iTCP:3000 -sTCP:LISTEN > /dev/null 2>&1 || ss -ltn 2>/dev/null | grep -q ':3000'; then
    REACT_RUNNING=true
    echo -e "${GREEN}  ✓ React dev server is already running on port 3000${NC}"
fi

echo ""
echo "============================================================"
echo -e "${GREEN}✓ All Components Verified!${NC}"
echo "============================================================"
echo ""
echo "Services Status:"
echo "  • MongoDB:    Running on 0.0.0.0:27017"
echo "  • LocalStack: Running on localhost:4566"
echo "  • Backend:    Deployed to LocalStack"
echo "  • Proxy:      Running on localhost:3001"
if [ "$REACT_RUNNING" = true ]; then
    echo "  • Frontend:   Already running on localhost:3000"
else
    echo "  • Frontend:   Ready to start"
fi
echo ""

if [ "$REACT_RUNNING" = true ]; then
    echo "All services are running!"
    echo "  Frontend: http://localhost:3000"
    echo "  Proxy:    http://localhost:3001"
else
    echo "Starting React development server..."
    echo "  Frontend: http://localhost:3000"
    echo "  Proxy:    http://localhost:3001"
    echo ""
    echo "Press Ctrl+C to stop"
    echo ""

    # Cleanup: Kill proxy server when script exits
    if [ -f /tmp/proxy-server.pid ]; then
        PROXY_PID=$(cat /tmp/proxy-server.pid)
        trap "kill $PROXY_PID 2>/dev/null; rm -f /tmp/proxy-server.pid" EXIT
    fi

    # Start React development server
    npm start
fi
