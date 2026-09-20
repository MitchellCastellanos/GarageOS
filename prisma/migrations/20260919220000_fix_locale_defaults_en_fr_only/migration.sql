-- User.preferredLocale defaulted to ES, an unreachable value everywhere it's
-- consumed (resolveAdminLocale, getInvoiceStrings, AppointmentEmail, etc. all
-- silently fall back to EN for anything that isn't "FR"). Every platform
-- account is meant to run on English or French only — align the schema
-- default with that and backfill any row that quietly picked up ES so the
-- stored value matches what the UI has always rendered.
ALTER TABLE "garageos"."User" ALTER COLUMN "preferredLocale" SET DEFAULT 'EN';

UPDATE "garageos"."User" SET "preferredLocale" = 'EN' WHERE "preferredLocale" = 'ES';
UPDATE "garageos"."Shop" SET "defaultLanguage" = 'FR' WHERE "defaultLanguage" = 'ES';
UPDATE "garageos"."Client" SET "language" = 'FR' WHERE "language" = 'ES';
UPDATE "garageos"."Invoice" SET "language" = 'FR' WHERE "language" = 'ES';
UPDATE "garageos"."Quote" SET "language" = 'FR' WHERE "language" = 'ES';
