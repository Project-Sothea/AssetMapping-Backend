#!/usr/bin/env node

/**
 * Migration Helper Script
 *
 * This script helps you run the database migration on Supabase.
 * Since Supabase doesn't support executing raw SQL via API,
 * you need to run the migration through the Supabase Dashboard.
 */

const fs = require('fs');
const path = require('path');

console.log('🔄 Database Migration Helper\n');

// Read the .env file to get project reference
const envPath = path.join(__dirname, '..', '.env');
let projectRef = 'YOUR_PROJECT_REF';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const supabaseUrl = envContent.match(/SUPABASE_URL=(https:\/\/([^.]+)\.supabase\.co)/);
  if (supabaseUrl && supabaseUrl[2]) {
    projectRef = supabaseUrl[2];
  }
}

// Read migration files
const migrations = [
  { file: '001_add_event_sourcing.sql', description: 'Add event sourcing support' },
  { file: '002_add_name_to_forms.sql', description: 'Add name column to forms' },
];

let fullMigrationSQL = '';

migrations.forEach((migration) => {
  const migrationPath = path.join(__dirname, '..', 'migrations', migration.file);
  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
  fullMigrationSQL += `-- Migration: ${migration.description}\n${migrationSQL}\n\n`;
});

console.log('📋 Database Migration Instructions\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('Since Supabase requires SQL to be run via the dashboard,');
console.log('please follow these steps:\n');

console.log('1️⃣  Open the Supabase SQL Editor:');
console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`);

console.log('2️⃣  Copy the migration SQL:');
console.log(`   The migration files are located at:`);
console.log(
  `   ${migrations.map((m) => path.join(__dirname, '..', 'migrations', m.file)).join('\n   ')}\n`
);

console.log('3️⃣  Paste and run in SQL Editor:');
console.log('   - Paste the entire contents of all migration files');
console.log('   - Click "Run" button\n');

console.log('4️⃣  Verify the migration:');
console.log('   You should see:');
console.log('   ✓ Table "outbox" created');
console.log('   ✓ Column "version" added to "pins"');
console.log('   ✓ Column "version" added to "forms"');
console.log('   ✓ Column "name" added to "forms"');
console.log('   ✓ Functions created\n');

console.log('5️⃣  Restart your backend server:');
console.log('   npm run dev\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('📄 Migration Files Preview (first 20 lines each):\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
migrations.forEach((migration) => {
  const migrationPath = path.join(__dirname, '..', 'migrations', migration.file);
  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
  console.log(`\n--- ${migration.file} ---`);
  const lines = migrationSQL.split('\n').slice(0, 10);
  lines.forEach((line) => console.log(line));
  console.log(`... (${migrationSQL.split('\n').length} lines total)`);
});
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Try to copy to clipboard on macOS
try {
  const { execSync } = require('child_process');
  execSync(`echo "${fullMigrationSQL.replace(/"/g, '\\"')}" | pbcopy`, { stdio: 'ignore' });
  console.log('✅ Migration SQL copied to clipboard!\n');
  console.log('Just paste it into the Supabase SQL Editor and click Run.\n');
} catch (e) {
  console.log('💡 Tip: Copy the migration files contents manually:\n');
  migrations.forEach((migration) => {
    const migrationPath = path.join(__dirname, '..', 'migrations', migration.file);
    console.log(`   cat ${migrationPath}`);
  });
  console.log('');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
