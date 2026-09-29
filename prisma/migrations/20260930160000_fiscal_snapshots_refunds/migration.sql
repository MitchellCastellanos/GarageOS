-- Block 9: fiscal snapshots, refunds, financial audit log, more payment methods. Additive only.

-- AlterEnum (each value is added in its own statement; none is used inside this migration)
ALTER TYPE "garageos"."InvoicePaymentEntryMethod" ADD VALUE IF NOT EXISTS 'ETRANSFER';
ALTER TYPE "garageos"."InvoicePaymentEntryMethod" ADD VALUE IF NOT EXISTS 'CHEQUE';
ALTER TYPE "garageos"."InvoicePaymentEntryMethod" ADD VALUE IF NOT EXISTS 'OTHER';

-- AlterTable
ALTER TABLE "garageos"."Invoice" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'CAD',
ADD COLUMN     "taxRegistration" TEXT,
ADD COLUMN     "taxSnapshot" JSONB;

-- AlterTable
ALTER TABLE "garageos"."Quote" ADD COLUMN     "taxSnapshot" JSONB;

-- CreateTable
CREATE TABLE "garageos"."InvoiceRefund" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL,
    "taxLines" JSONB NOT NULL DEFAULT '[]',
    "method" "garageos"."InvoicePaymentEntryMethod" NOT NULL,
    "reason" TEXT NOT NULL,
    "refundedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."FinancialEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "amount" DECIMAL(10,2),
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceRefund_shopId_refundedAt_idx" ON "garageos"."InvoiceRefund"("shopId", "refundedAt");

-- CreateIndex
CREATE INDEX "InvoiceRefund_invoiceId_idx" ON "garageos"."InvoiceRefund"("invoiceId");

-- CreateIndex
CREATE INDEX "FinancialEvent_shopId_createdAt_idx" ON "garageos"."FinancialEvent"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialEvent_invoiceId_idx" ON "garageos"."FinancialEvent"("invoiceId");

-- AddForeignKey
ALTER TABLE "garageos"."InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."InvoiceRefund" ADD CONSTRAINT "InvoiceRefund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "garageos"."Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."FinancialEvent" ADD CONSTRAINT "FinancialEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: freeze fiscal data of EXISTING invoices so later changes to the shop's tax settings
-- can never alter them. The snapshot lines come from the shop's current taxLines ONLY when they
-- reproduce the invoice exactly (Σ rates = invoice.taxRate AND Σ rounded per-line tax = invoice.taxAmount);
-- otherwise a single generic "Tax" line carries the stored rate/amount ('backfill-generic').
-- Registration number and currency are copied from the shop as of this migration (the only
-- information available for pre-existing invoices).
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "garageos"."Invoice" i
SET "taxRegistration" = s."taxId",
    "currency"        = COALESCE(NULLIF(s."currency", ''), 'CAD')
FROM "garageos"."Shop" s
WHERE s."id" = i."shopId";

WITH tl AS (
  SELECT s."id" AS shop_id, e.elem, e.ord
  FROM "garageos"."Shop" s,
       LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(s."taxLines") = 'array' THEN s."taxLines" ELSE '[]'::jsonb END
       ) WITH ORDINALITY AS e(elem, ord)
),
valid_shops AS (
  SELECT shop_id
  FROM tl
  GROUP BY shop_id
  HAVING bool_and((elem->>'rate') ~ '^[0-9]+(\.[0-9]+)?$' AND coalesce(btrim(elem->>'name'), '') <> '')
),
per_invoice AS (
  SELECT i."id", i."taxRate", i."taxAmount",
         jsonb_agg(
           jsonb_build_object(
             'name', btrim(tl.elem->>'name'),
             'rate', tl.elem->>'rate',
             'amount', to_char(round(i."subtotal" * (tl.elem->>'rate')::numeric, 2), 'FM999999990.00')
           ) ORDER BY tl.ord
         ) AS lines,
         sum((tl.elem->>'rate')::numeric) AS sum_rate,
         sum(round(i."subtotal" * (tl.elem->>'rate')::numeric, 2)) AS sum_tax
  FROM "garageos"."Invoice" i
  JOIN valid_shops v ON v.shop_id = i."shopId"
  JOIN tl ON tl.shop_id = i."shopId"
  WHERE i."taxSnapshot" IS NULL
  GROUP BY i."id", i."taxRate", i."taxAmount"
)
UPDATE "garageos"."Invoice" i
SET "taxSnapshot" = jsonb_build_object('v', 1, 'source', 'backfill', 'exempt', false, 'lines', p.lines)
FROM per_invoice p
WHERE i."id" = p."id" AND p.sum_rate = p."taxRate" AND p.sum_tax = p."taxAmount" AND p."taxRate" > 0;

UPDATE "garageos"."Invoice"
SET "taxSnapshot" = CASE
  WHEN "taxRate" = 0 AND "taxAmount" = 0
    THEN jsonb_build_object('v', 1, 'source', 'backfill-generic', 'exempt', true, 'lines', '[]'::jsonb)
  ELSE jsonb_build_object(
    'v', 1, 'source', 'backfill-generic', 'exempt', false,
    'lines', jsonb_build_array(jsonb_build_object(
      'name', 'Tax', 'rate', "taxRate"::text, 'amount', to_char("taxAmount", 'FM999999990.00')))
  )
END
WHERE "taxSnapshot" IS NULL;
