#!/bin/bash

# Quick start script for AssetMapping Backend
# This script sets up and starts the backend server with all dependencies

set -e

echo "🚀 Starting AssetMapping Backend..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found${NC}"
    echo "Copying .env.example to .env..."
    cp .env.example .env
    echo -e "${RED}❗ Please edit .env with your configuration before continuing${NC}"
    echo ""
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running${NC}"
    echo "Please start Docker Desktop and try again"
    exit 1
fi

echo -e "${GREEN}✓ Docker is running${NC}"
echo ""

# Start Redis and Kafka
echo "Starting Redis and Kafka..."
docker-compose up -d

# Wait for services to be healthy
echo "Waiting for services to be ready..."
sleep 5

# Check Redis
if docker exec assetmapping-redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Redis is ready${NC}"
else
    echo -e "${RED}❌ Redis failed to start${NC}"
    exit 1
fi

# Check Kafka (simplified check)
if docker ps | grep assetmapping-kafka | grep -q "Up"; then
    echo -e "${GREEN}✓ Kafka is ready${NC}"
else
    echo -e "${RED}❌ Kafka failed to start${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✓ All services are ready!${NC}"
echo ""
echo "Starting backend server..."
echo ""

# Start the backend in development mode
npm run dev
