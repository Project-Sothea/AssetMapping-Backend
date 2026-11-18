DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM forms f LEFT JOIN pins p ON p.id = f."pinId"
    WHERE p.id IS NULL
      OR btrim(coalesce(f.village, '')) <> btrim(coalesce(p."cityVillage", ''))
      OR btrim(coalesce(f."otherVillage", '')) <> ''
  ) THEN
    RAISE EXCEPTION 'Village migration requires a reconciled dataset; original values were preserved';
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "form_village_archive" (
	"formId" uuid PRIMARY KEY NOT NULL,
	"village" text,
	"otherVillage" text,
	"pinVillage" text
);
--> statement-breakpoint
INSERT INTO "form_village_archive" ("formId", "village", "otherVillage", "pinVillage")
SELECT f."id", f."village", f."otherVillage", p."cityVillage"
FROM "forms" f LEFT JOIN "pins" p ON p."id" = f."pinId";--> statement-breakpoint
ALTER TABLE "forms" DROP COLUMN "village";--> statement-breakpoint
ALTER TABLE "forms" DROP COLUMN "otherVillage";