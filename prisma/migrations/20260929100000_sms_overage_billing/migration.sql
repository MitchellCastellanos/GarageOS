-- Cobro de excedente de SMS: segmentos facturables por mensaje reportados a Stripe.
-- AlterTable
ALTER TABLE "garageos"."CommunicationMessage" ADD COLUMN     "billedOverageSegments" INTEGER;

