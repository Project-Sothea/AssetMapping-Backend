-- Run with the new backend stopped, before restoring the previous backend deployment.
-- Keeps post-migration rows; restores original per-form values for existing rows.
BEGIN;
ALTER TABLE public.forms ADD COLUMN "village" text;
ALTER TABLE public.forms ADD COLUMN "otherVillage" text;
UPDATE public.forms AS f
SET "village" = coalesce(
      (SELECT CASE WHEN p."cityVillage" IS DISTINCT FROM a."pinVillage"
                   THEN p."cityVillage" ELSE a."village" END
       FROM public.form_village_archive a JOIN public.pins p ON p.id=f."pinId"
       WHERE a."formId"=f.id),
      (SELECT p."cityVillage" FROM public.pins p WHERE p.id=f."pinId"), ''),
    "otherVillage" = (SELECT CASE WHEN p."cityVillage" IS DISTINCT FROM a."pinVillage"
                   THEN NULL ELSE a."otherVillage" END
       FROM public.form_village_archive a JOIN public.pins p ON p.id=f."pinId"
       WHERE a."formId"=f.id);
ALTER TABLE public.forms ALTER COLUMN "village" SET NOT NULL;
DROP TABLE public.form_village_archive;
-- Remove only this migration's journal record so a later re-apply is possible.
DELETE FROM drizzle.__drizzle_migrations
WHERE hash = '__MIGRATION_SHA256__';
COMMIT;
