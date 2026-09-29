-- Block 1 — ciclo de vida de suscripción: el taller nuevo ya no nace como
-- "Pro en trial" sin método de pago. Nace en AWAITING_PLAN (sin plan) y el
-- onboarding lo lleva a Stripe Checkout con el plan elegido.

-- AlterEnum
ALTER TYPE "garageos"."SubscriptionStatus" ADD VALUE 'AWAITING_PLAN';

-- AlterTable: plan pasa a ser opcional (null = aún no eligió).
ALTER TABLE "garageos"."Subscription" ALTER COLUMN "plan" DROP NOT NULL;

-- status ya no tiene DEFAULT: cada punto de creación elige el estado inicial
-- explícitamente (createPendingSubscription → AWAITING_PLAN), nunca uno implícito.
ALTER TABLE "garageos"."Subscription" ALTER COLUMN "status" DROP DEFAULT;

-- CreateTable
CREATE TABLE "garageos"."StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);
