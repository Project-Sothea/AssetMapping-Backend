/**
 * Script to inspect the actual database schema from Supabase
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function getTableSchema(tableName: string) {
  console.log(`\n=== ${tableName.toUpperCase()} TABLE ===`);

  // Get a sample record to see the structure
  const { data, error } = await supabase.from(tableName).select('*').limit(1);

  if (error) {
    console.error(`Error querying ${tableName}:`, error.message);
    return;
  }

  if (data && data.length > 0) {
    console.log('Columns found:');
    const columns = Object.keys(data[0]);
    columns.forEach((col) => {
      const value = data[0][col];
      const type = value === null ? 'null' : typeof value;
      console.log(`  - ${col}: ${type} = ${JSON.stringify(value)}`);
    });
  } else {
    console.log('No data found in table');
  }

  // Get count
  const { count } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
  console.log(`Total records: ${count}`);
}

async function inspectSchema() {
  console.log('Inspecting Supabase Database Schema...\n');
  console.log(`Connected to: ${supabaseUrl}`);

  try {
    await getTableSchema('pins');
    await getTableSchema('forms');
    await getTableSchema('outbox');
  } catch (error) {
    console.error('Error inspecting schema:', error);
  }
}

inspectSchema();
