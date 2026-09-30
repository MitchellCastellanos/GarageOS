-- Block 15: fixed-window rate-limit counters (login, signup, portal, booking, contact). Additive only.
CREATE TABLE "garageos"."RateLimitBucket" (
    "id" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "garageos"."RateLimitBucket"("expiresAt");
