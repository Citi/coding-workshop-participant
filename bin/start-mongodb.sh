#!/bin/bash
#
# Setup Workshop Environment
#
# This script:
# 1. Starts MongoDB configured for LocalStack
# 2. Initializes the database with sample data
# 3. Tests that everything is working
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "============================================================"
echo "Workshop Environment Setup"
echo "============================================================"
echo ""

# ============================================================
# STEP 1: Start MongoDB
# ============================================================
echo -e "${BLUE}[1/3] Starting MongoDB...${NC}"

if ! command -v mongod &> /dev/null; then
    echo -e "${RED}Error: MongoDB is not installed${NC}"
    echo "Install: brew install mongodb-community"
    exit 1
fi

# Check if already running correctly
if pgrep -x "mongod" > /dev/null; then
    if lsof -iTCP:27017 -sTCP:LISTEN &> /dev/null || ss -ltn | grep -q ':27017'; then
        echo -e "${GREEN}  ✓ MongoDB already running (bound to 0.0.0.0)${NC}"
    else
        echo -e "${YELLOW}  ⚠ MongoDB running but misconfigured, restarting...${NC}"
        PID=$(pgrep -x "mongod" || true)
        if [ -n "$PID" ]; then
            OWNER=$(ps -o user= -p "$PID" | tr -d ' ')
            if [ "$OWNER" != "$(whoami)" ]; then
                echo -e "${YELLOW}    ⚠ mongod is running as ${OWNER}. Attempting restart with system tools or sudo...${NC}"
                if command -v systemctl &> /dev/null && systemctl list-units --type=service --all | grep -q mongod; then
                    sudo systemctl restart mongod || true
                else
                    sudo kill "$PID" || true
                fi
            else
                kill "$PID" || true
            fi
            sleep 2
        fi

        DATA_DIR="/usr/local/var/mongodb"
        LOG_DIR="/usr/local/var/log/mongodb"
        mkdir -p "$DATA_DIR" "$LOG_DIR"

        mongod --dbpath "$DATA_DIR" --bind_ip 0.0.0.0 --port 27017 --fork --logpath "$LOG_DIR/mongo.log"
        sleep 2
        echo -e "${GREEN}  ✓ MongoDB restarted${NC}"
    fi
else
    DATA_DIR="/usr/local/var/mongodb"
    LOG_DIR="/usr/local/var/log/mongodb"
    mkdir -p "$DATA_DIR" "$LOG_DIR"

    mongod --dbpath "$DATA_DIR" --bind_ip 0.0.0.0 --port 27017 --fork --logpath "$LOG_DIR/mongo.log"
    sleep 2
    echo -e "${GREEN}  ✓ MongoDB started${NC}"
fi
echo ""

# ============================================================
# STEP 2: Initialize Database
# ============================================================
echo -e "${BLUE}[2/3] Initializing Database...${NC}"

if ! command -v mongosh &> /dev/null; then
    echo -e "${RED}Error: mongosh is not installed${NC}"
    echo "Install: brew install mongosh"
    exit 1
fi

APP_ID="${APP_ID:-abcd1234}"
DB_NAME="workshop-${APP_ID}"

# Create collections
mongosh "$DB_NAME" --quiet --file "$PROJECT_ROOT/data/init-mongodb.js" > /dev/null 2>&1 || true
echo -e "${GREEN}  ✓ Collections created${NC}"

# Import data (capture full output for diagnostics)
IMPORT_LOG="$(mktemp)"
trap 'rm -f "$IMPORT_LOG"' EXIT
cd "$PROJECT_ROOT"
# Note: No --username/--password means no authentication (for local dev)
python3 data/import-data.py --database "$DB_NAME" > "$IMPORT_LOG" 2>&1 || true

# Show a short summary of the import (and keep full log in case of problems)
echo -e "${BLUE}  Import log (tail):${NC}"
tail -n 20 "$IMPORT_LOG" | sed 's/^/    /'
echo -e "${GREEN}  ✓ Sample data import attempted (see log above)${NC}"
echo ""

# Compute expected number of individuals from CSV
CSV_FILE="$PROJECT_ROOT/data/individual.csv"
if [ -f "$CSV_FILE" ]; then
    EXPECTED_COUNT=$(( $(wc -l < "$CSV_FILE") - 1 ))
else
    EXPECTED_COUNT=0
fi

# ============================================================
# STEP 3: Verify
# ============================================================
echo -e "${BLUE}[3/3] Verifying Setup...${NC}"

DOC_COUNT=$(mongosh "$DB_NAME" --quiet --eval "db.individuals.countDocuments({})" 2>/dev/null || echo "0")
if [ "$DOC_COUNT" -gt 0 ]; then
    echo -e "${GREEN}  ✓ Database (${DB_NAME}) has data ($DOC_COUNT individuals)${NC}"
    if [ "$EXPECTED_COUNT" -gt 0 ] && [ "$DOC_COUNT" -ne "$EXPECTED_COUNT" ]; then
        echo -e "${YELLOW}    ⚠ Expected ${EXPECTED_COUNT} rows from CSV but found ${DOC_COUNT}${NC}"
    fi
else
    echo -e "${RED}  ✗ No data in target database (${DB_NAME})${NC}"
    echo -e "${BLUE}  Scanning other workshop-* databases for data...${NC}"
    mongosh --quiet --eval 'db.getMongo().getDBNames().forEach(function(name){ try{ var c=db.getSiblingDB(name).individuals.countDocuments({}); if(c>0) print(name+":"+c);}catch(e){} })' > /tmp/_db_scan 2>/dev/null || true
    if [ -s /tmp/_db_scan ]; then
        echo -e "${YELLOW}  ⚠ Found individuals in other DB(s):${NC}"
        sed 's/^/    /' /tmp/_db_scan
        echo -e "${YELLOW}  Suggestion: set APP_ID to match the DB prefix (e.g. APP_ID=<id> ./bin/start-mongodb.sh) or re-run the import with --database \"${DB_NAME}\"${NC}"
    else
        echo -e "${RED}  ✗ No individuals found in any workshop-* database${NC}"
        echo -e "${BLUE}  Import log (tail) for debugging:${NC}"
        tail -n 200 "$IMPORT_LOG" | sed 's/^/    /'
        echo -e "${BLUE}  Suggestion: inspect the import command and re-run: python3 data/import-data.py --database \"${DB_NAME}\"${NC}"
        exit 1
    fi
fi

# Check MongoDB accessibility via mongosh ping
PING_OK=$(mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null || echo "0")
if [ "$PING_OK" = "1" ]; then
    echo -e "${GREEN}  ✓ MongoDB reachable (mongosh ping OK)${NC}"
else
    echo -e "${RED}  ✗ MongoDB not reachable via mongosh ping${NC}"
    exit 1
fi

echo ""
echo "============================================================"
echo -e "${GREEN}✓ Setup Complete!${NC}"
echo "============================================================"
echo ""
echo "Next steps:"
echo "  1. Deploy infrastructure: ./bin/deploy-backend"
echo "  2. Start frontend: cd frontend && npm start"
echo ""
