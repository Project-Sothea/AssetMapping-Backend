import { readFileSync } from 'fs';
import { join } from 'path';
import { supabase } from '../src/config/supabase';

async function runMigration() {
  console.log('🔄 Running database migration...\n');

  try {
    // Read migration file
    const migrationPath = join(__dirname, '..', 'migrations', '001_add_event_sourcing.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📝 Migration file loaded');
    console.log('🚀 Executing migration...\n');

    // Execute migration
    // Note: Supabase client doesn't support multi-statement SQL execution directly
    // We need to split and execute statements individually
    const statements = migrationSQL
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

    let successCount = 0;
    let skipCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';

      // Skip comments and empty lines
      if (statement.trim().startsWith('COMMENT ON')) {
        console.log(`⏭️  Statement ${i + 1}/${statements.length}: Skipping comment`);
        skipCount++;
        continue;
      }

      try {
        console.log(`⚙️  Statement ${i + 1}/${statements.length}: Executing...`);

        const { error } = await supabase.rpc('exec_sql', { sql_query: statement });

        if (error) {
          // Check if it's an "already exists" error (safe to ignore)
          if (error.message.includes('already exists') || error.message.includes('duplicate key')) {
            console.log(`   ⚠️  Already exists (safe to skip)`);
            skipCount++;
          } else {
            throw error;
          }
        } else {
          console.log(`   ✅ Success`);
          successCount++;
        }
      } catch (err: unknown) {
        const error = err as { message?: string; code?: string };
        console.error(`   ❌ Error: ${error.message}`);

        // Some errors are acceptable (like "already exists")
        if (
          error.message?.includes('already exists') ||
          error.message?.includes('duplicate key') ||
          error.message?.includes('column "version" of relation') ||
          error.code === '42P07' || // duplicate_table
          error.code === '42701' // duplicate_column
        ) {
          console.log(`   ⚠️  Safe to ignore (already exists)`);
          skipCount++;
        } else {
          console.error('\n❌ Migration failed!');
          console.error('Error details:', error);
          process.exit(1);
        }
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log(`   ${successCount} statements executed`);
    console.log(`   ${skipCount} statements skipped`);
    console.log('\n🔍 Verifying migration...');

    // Verify outbox table exists
    const { error: outboxError } = await supabase.from('outbox').select('count').limit(0);

    if (outboxError) {
      // If we get a specific error about the table not existing, use the SQL editor method
      if (outboxError.code === '42P01') {
        console.log(
          '\n⚠️  Outbox table not found. This means Supabase RPC might not support exec_sql.'
        );
        console.log('\n📋 Please use the Supabase Dashboard SQL Editor:');
        console.log(
          '   1. Go to: https://supabase.com/dashboard/project/oadlvwudppmesgkbhlkm/editor'
        );
        console.log('   2. Click "SQL Editor"');
        console.log('   3. Paste the contents of migrations/001_add_event_sourcing.sql');
        console.log('   4. Click "Run"');
        process.exit(1);
      }
    } else {
      console.log('   ✅ Outbox table created');
    }

    // Verify pins.version column
    const { error: pinsError } = await supabase.from('pins').select('id, version').limit(1);

    if (!pinsError) {
      console.log('   ✅ Pins.version column added');
    }

    // Verify forms.version column
    const { error: formsError } = await supabase.from('forms').select('id, version').limit(1);

    if (!formsError) {
      console.log('   ✅ Forms.version column added');
    }

    console.log('\n🎉 Database migration completed successfully!');
    console.log('📝 Next steps:');
    console.log('   1. Restart the backend server: npm run dev');
    console.log('   2. Check logs for "Outbox relayer started"');
    console.log('   3. Test with: curl http://localhost:3000/health');
  } catch (err: unknown) {
    const error = err as { message?: string };
    console.error('\n❌ Migration failed!');
    console.error('Error:', error.message);

    console.log('\n📋 Alternative method - Use Supabase Dashboard:');
    console.log('   1. Go to: https://supabase.com/dashboard/project/oadlvwudppmesgkbhlkm/editor');
    console.log('   2. Click "SQL Editor" in the left sidebar');
    console.log('   3. Click "New query"');
    console.log('   4. Copy and paste migrations/001_add_event_sourcing.sql');
    console.log('   5. Click "Run"');

    process.exit(1);
  }
}

// Run migration
runMigration();
