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

// Read migration file
const migrationPath = path.join(__dirname, '..', 'migrations', '001_add_event_sourcing.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

console.log('📋 Database Migration Instructions\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('Since Supabase requires SQL to be run via the dashboard,');
console.log('please follow these steps:\n');

console.log('1️⃣  Open the Supabase SQL Editor:');
console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`);

console.log('2️⃣  Copy the migration SQL:');
console.log(`   The migration file is located at:`);
console.log(`   ${migrationPath}\n`);

console.log('3️⃣  Paste and run in SQL Editor:');
console.log('   - Paste the entire contents of the migration file');
console.log('   - Click "Run" button\n');

console.log('4️⃣  Verify the migration:');
console.log('   You should see:');
console.log('   ✓ Table "outbox" created');
console.log('   ✓ Column "version" added to "pins"');
console.log('   ✓ Column "version" added to "forms"');
console.log('   ✓ Functions created\n');

console.log('5️⃣  Restart your backend server:');
console.log('   npm run dev\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('📄 Migration File Preview (first 20 lines):\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const lines = migrationSQL.split('\n').slice(0, 20);
lines.forEach(line => console.log(line));
console.log('...');
console.log(`(${migrationSQL.split('\n').length} lines total)`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Try to copy to clipboard on macOS
try {
  const { execSync } = require('child_process');
  execSync(`echo "${migrationSQL.replace(/"/g, '\\"')}" | pbcopy`, { stdio: 'ignore' });
  console.log('✅ Migration SQL copied to clipboard!\n');
  console.log('Just paste it into the Supabase SQL Editor and click Run.\n');
} catch (e) {
  console.log('💡 Tip: Copy the migration file contents manually:\n');
  console.log(`   cat ${migrationPath} | pbcopy\n`);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
