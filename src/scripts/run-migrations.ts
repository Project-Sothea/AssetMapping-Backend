#!/usr/bin/env node

/**
 * Simple migration runner for PostgreSQL
 * Run migrations from the migrations directory
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = process.cwd();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration(filename: string) {
  const migrationPath = path.join(__dirname, '..', 'migrations', filename);

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${filename}`);
    return false;
  }

  console.log(`\n📄 Running migration: ${filename}`);

  const sql = fs.readFileSync(migrationPath, 'utf-8');

  try {
    // Execute the SQL directly using Supabase
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error(`❌ Migration failed: ${error.message}`);
      return false;
    }

    console.log(`✅ Migration completed: ${filename}`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error running migration: ${errorMessage}`);
    return false;
  }
}

async function runAllMigrations() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.error('❌ Migrations directory not found');
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && !f.includes('rollback'))
    .sort();

  console.log(`\n🚀 Running ${files.length} migrations...\n`);

  for (const file of files) {
    const success = await runMigration(file);
    if (!success) {
      console.error('\n❌ Migration process stopped due to error');
      process.exit(1);
    }
  }

  console.log('\n✅ All migrations completed successfully!\n');
}

// Run migrations
runAllMigrations().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
