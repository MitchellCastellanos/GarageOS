-- Same-person link between platform accounts (independent CASL review compares people, not accounts).
-- Additive and inert: one nullable column, no backfill, no data change, no behaviour change until a Super Admin sets a key.
ALTER TABLE "garageos"."User" ADD COLUMN "personKey" TEXT;
CREATE INDEX "User_personKey_idx" ON "garageos"."User"("personKey");
