// filepath: /Users/luciusyeojunjie/Desktop/repos/ProjectSothea/AssetMapping-Backend/src/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(
  process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/your_project_db'
);
export const db = drizzle(client, { schema });
