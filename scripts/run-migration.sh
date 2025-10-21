#!/bin/bash

# Script to run database migrations
# Usage: ./scripts/run-migration.sh

set -e

echo "🔍 Reading Supabase configuration..."

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ .env file not found"
    exit 1
fi

# Check required variables
if [ -z "$SUPABASE_URL" ]; then
    echo "❌ SUPABASE_URL not set in .env"
    exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ SUPABASE_SERVICE_ROLE_KEY not set in .env"
    exit 1
fi

# Extract project reference from Supabase URL
# Format: https://<project-ref>.supabase.co
PROJECT_REF=$(echo $SUPABASE_URL | sed -E 's|https://([^.]+)\.supabase\.co.*|\1|')

echo "📊 Project Reference: $PROJECT_REF"
echo ""
echo "⚠️  You need to run the migration using one of these methods:"
echo ""
echo "METHOD 1 - Supabase Dashboard (Recommended):"
echo "1. Go to https://supabase.com/dashboard/project/$PROJECT_REF/editor"
echo "2. Click 'SQL Editor' in the left sidebar"
echo "3. Click 'New query'"
echo "4. Copy and paste the contents of migrations/001_add_event_sourcing.sql"
echo "5. Click 'Run'"
echo ""
echo "METHOD 2 - Direct Database Connection:"
echo "1. Get your database password from Supabase dashboard:"
echo "   https://supabase.com/dashboard/project/$PROJECT_REF/settings/database"
echo "2. Find the 'Connection string' section"
echo "3. Copy the 'URI' connection string"
echo "4. Run: psql 'YOUR_CONNECTION_STRING' -f migrations/001_add_event_sourcing.sql"
echo ""
echo "METHOD 3 - Using psql with pooler:"
echo "psql postgresql://postgres.[YOUR_PROJECT_REF]:[YOUR_DB_PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres -f migrations/001_add_event_sourcing.sql"
echo ""
echo "📝 After running the migration, restart the backend server."
