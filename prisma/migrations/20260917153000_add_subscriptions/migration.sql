-- CreateEnum
CREATE TYPE "garageos"."Plan" AS ENUM ('CORE', 'PRO', 'COMPLETE');

-- CreateEnum
CREATE TYPE "garageos"."SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "garageos"."BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "garageos"."Subscription" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "plan" "garageos"."Plan" NOT NULL,
    "status" "garageos"."SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "billingInterval" "garageos"."BillingInterval",
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_shopId_key" ON "garageos"."Subscription"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "garageos"."Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "garageos"."Subscription"("stripeSubscriptionId");

-- AddForeignKey
ALTER TABLE "garageos"."Subscription" ADD CONSTRAINT "Subscription_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: los talleres que ya existían antes de que existieran los planes
-- de suscripción quedan en COMPLETE/ACTIVE ("grandfathered") para no
-- interrumpirles ninguna función que ya estuvieran usando (inventario,
-- campañas, dominio propio, identidades de envío, multi-sucursal, etc.).
-- Los talleres nuevos (signup) arrancan en PRO/TRIALING desde el código de
-- la app (ver src/lib/subscription.ts createDefaultSubscription), no desde
-- esta migración.
--
-- Solo se crea UNA fila por organización — la del Shop más antiguo de cada
-- grupo (o de cada Shop suelto sin organización) — porque
-- getEffectiveSubscription (src/lib/subscription.ts) resuelve el plan de
-- todo el org buscando la Subscription de cualquiera de sus Shops.
WITH ranked_shops AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE("organizationId", "id")
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "garageos"."Shop"
)
INSERT INTO "garageos"."Subscription" ("id", "shopId", "plan", "status", "updatedAt")
SELECT concat('sub-', "id"), "id", 'COMPLETE', 'ACTIVE', now()
FROM ranked_shops
WHERE rn = 1
ON CONFLICT ("shopId") DO NOTHING;
