# Migrations Directory

This directory previously contained SQL migration files that tracked the evolution of the database schema.

## Current Status

**The migrations have been removed** because:

1. ✅ The database schema is already established in Supabase production
2. ✅ The complete schema is documented in [`/docs/DATABASE_SCHEMA.md`](../docs/DATABASE_SCHEMA.md)
3. ✅ TypeScript types are defined in [`/src/types/database.schema.ts`](../src/types/database.schema.ts)
4. ✅ The schema was verified directly from the production database on November 5, 2025

## Schema Management

For schema information, refer to:

- **Documentation**: `/docs/DATABASE_SCHEMA.md` - Human-readable schema documentation
- **TypeScript Types**: `/src/types/database.schema.ts` - Type-safe schema definitions
- **Supabase Dashboard**: Direct schema management and modifications

## Future Migrations

If you need to make schema changes:

1. Apply changes directly in Supabase Dashboard or via SQL
2. Update `/docs/DATABASE_SCHEMA.md` with the changes
3. Update `/src/types/database.schema.ts` with the new types
4. Run `/scripts/inspect-schema.ts` to verify the changes match production

## Note

Historical migration files (001, 002) were removed as they served their purpose and the schema is now stable.
