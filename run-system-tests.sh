#!/bin/bash

# Quick Start Guide for System Tests
# Copy this file to your project root and make it executable:
# chmod +x run-system-tests.sh

echo "📋 AssetMapping Backend - System Tests Quick Start"
echo "===================================================="
echo ""

# Check if required dependencies are installed
echo "Checking dependencies..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

if ! command -v redis-cli &> /dev/null; then
    echo "❌ Redis is not installed"
    echo "Install with: brew install redis (macOS) or apt-get install redis (Linux)"
    exit 1
fi

echo "✅ All dependencies found"
echo ""

# Install npm packages if needed
if [ ! -d "node_modules" ]; then
    echo "Installing npm packages..."
    npm install
fi

# Install test dependencies
echo "Installing test dependencies..."
npm install --save-dev axios ts-jest @types/jest

echo ""
echo "===================================================="
echo "Available test commands:"
echo "===================================================="
echo ""
echo "1. Run all system tests:"
echo "   npm run test:system"
echo ""
echo "2. Run specific test suite:"
echo "   npm run test:push        # Push queue scenarios"
echo "   npm run test:pull        # Pull sync scenarios"
echo "   npm run test:version     # Version conflicts"
echo "   npm run test:idempotency # Idempotency tests"
echo ""
echo "3. Run with coverage:"
echo "   npm run test:coverage"
echo ""
echo "4. Watch mode (for development):"
echo "   npm run test:watch"
echo ""
echo "===================================================="
echo "Before running tests, make sure:"
echo "===================================================="
echo ""
echo "1. ✅ Backend server is running (npm run dev)"
echo "2. ✅ Redis server is running (redis-server)"
echo "3. ✅ Database is configured (.env file)"
echo "4. ✅ Migrations are up to date (npm run migrate)"
echo ""
echo "Ready to run tests? Press any key to continue..."
read -n 1 -s

echo ""
echo ""
echo "Starting system tests..."
npm run test:system
