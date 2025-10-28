-- Rollback migration for 002_add_name_to_forms.sql
-- Remove the `name` column from forms table
ALTER TABLE IF EXISTS public.forms
DROP COLUMN IF EXISTS name;
