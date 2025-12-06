import * as schema from '@assetmapping/shared-types/schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(
  process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/your_project_db'
);
export const db = drizzle(client, { schema });
