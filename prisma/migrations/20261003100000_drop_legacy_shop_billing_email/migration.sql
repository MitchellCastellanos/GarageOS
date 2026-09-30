-- Resolves the known Shop.billingEmail drift. The column was dropped in
-- 20260918174056, re-added by the 20260919120000 "repair" migration (a deployed
-- database was missing it), but schema.prisma no longer declares it and no code
-- reads or writes it (the billing contact lives on "Subscription"."billingEmail").
-- Dropping it makes a fresh database identical to schema.prisma.
-- IF EXISTS keeps this a no-op on any database that already lacks the column.
ALTER TABLE "garageos"."Shop" DROP COLUMN IF EXISTS "billingEmail";
