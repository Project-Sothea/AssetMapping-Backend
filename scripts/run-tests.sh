#!/bin/bash

# System Test Runner Script
# This script ensures the backend is running and executes system tests

set -e

echo "🧪 AssetMapping Backend - System Test Runner"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create a .env file with required environment variables"
    exit 1
fi

# Load environment variables
source .env

# Check if backend is running
echo "Checking if backend is running..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend is running${NC}"
else
    echo -e "${YELLOW}⚠ Backend is not running on port 3000${NC}"
    echo "Please start the backend with: npm run dev"
    echo ""
    read -p "Start backend now? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm run dev &
        BACKEND_PID=$!
        echo "Waiting for backend to start..."
        sleep 5
    else
        exit 1
    fi
fi

# Check if Redis is running (Docker)
echo "Checking if Redis is running..."
if docker ps | grep -q assetmapping-redis; then
    echo -e "${GREEN}✓ Redis is running (Docker)${NC}"
else
    echo -e "${YELLOW}⚠ Redis container is not running${NC}"
    echo "Starting Redis with Docker Compose..."
    docker-compose up -d redis
    sleep 2
    if docker ps | grep -q assetmapping-redis; then
        echo -e "${GREEN}✓ Redis started successfully${NC}"
    else
        echo -e "${RED}✗ Failed to start Redis${NC}"
        echo "Please start Redis with: docker-compose up -d redis"
        exit 1
    fi
fi

echo ""
echo "=============================================="
echo "Running system tests..."
echo "=============================================="
echo ""

# Parse command line arguments
TEST_FILE=""
WATCH_MODE=false
COVERAGE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --watch)
            WATCH_MODE=true
            shift
            ;;
        --coverage)
            COVERAGE=true
            shift
            ;;
        --file=*)
            TEST_FILE="${1#*=}"
            shift
            ;;
        *)
            TEST_FILE="$1"
            shift
            ;;
    esac
done

# Build jest command
JEST_CMD="jest --runInBand"

if [ -n "$TEST_FILE" ]; then
    JEST_CMD="$JEST_CMD $TEST_FILE"
else
    JEST_CMD="$JEST_CMD tests/system"
fi

if [ "$WATCH_MODE" = true ]; then
    JEST_CMD="$JEST_CMD --watch"
fi

if [ "$COVERAGE" = true ]; then
    JEST_CMD="$JEST_CMD --coverage"
fi

# Run tests (runInBand ensures sequential execution to avoid test isolation issues)
eval "npx $JEST_CMD"
TEST_EXIT_CODE=$?

# Cleanup
if [ -n "$BACKEND_PID" ]; then
    echo ""
    echo "Stopping backend..."
    kill $BACKEND_PID
fi

echo ""
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
else
    echo -e "${RED}✗ Some tests failed${NC}"
fi

exit $TEST_EXIT_CODE
