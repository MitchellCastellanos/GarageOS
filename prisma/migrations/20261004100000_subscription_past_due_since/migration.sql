-- GarageOS-enforced 48 h PAST_DUE grace. Additive, nullable column; safe for existing rows.
ALTER TABLE "garageos"."Subscription" ADD COLUMN "pastDueSince" TIMESTAMP(3);

-- Backfill policy (conservative toward customers, bounded for GarageOS): rows that are PAST_DUE today have
-- no reliable historical start (updatedAt moves on any edit; Stripe gives no past_due timestamp), so their
-- 48 h grace starts at migration time. No shop is locked out retroactively by the deploy, and every legacy
-- PAST_DUE row is restricted at most 48 h after it. Rows in any other status keep NULL (invariant:
-- pastDueSince IS NOT NULL <=> status = 'PAST_DUE').
-- Prisma stores DateTime as UTC in "timestamp without time zone", so the value is pinned to UTC explicitly
-- (not dependent on the session time zone).
UPDATE "garageos"."Subscription" SET "pastDueSince" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE "status" = 'PAST_DUE';
