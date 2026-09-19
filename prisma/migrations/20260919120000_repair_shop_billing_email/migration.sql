-- Repairs schema drift on production: `Shop.billingEmail` has been part of
-- the Prisma schema and the init migration since 20260911204000_init_garageos,
-- but is missing from the actual column list on at least one deployed
-- database even though that migration is recorded as applied there (its
-- checksum matches, so `prisma migrate deploy` reports "no pending
-- migrations" and never re-runs it). Idempotent so it's a no-op wherever the
-- column already exists.
ALTER TABLE "garageos"."Shop" ADD COLUMN IF NOT EXISTS "billingEmail" TEXT;
