import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.NODE_ENV === 'qa' ? '.env.qa' : '.env' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/shared-types/src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
