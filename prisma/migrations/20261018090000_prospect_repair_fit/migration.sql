-- Repair fit: a durable, auditable "is this a legitimate automotive repair business?" disposition on the CRM prospect.
-- Additive only: two enums, seven columns (all nullable / defaulted), two indexes. NO data change and NO backfill: every existing prospect keeps
-- repairFit = NULL ("not evaluated") until the Super Admin runs the cleanup (preview first). Nothing is deleted, unassigned or archived by this migration.
CREATE TYPE "garageos"."CrmRepairFit" AS ENUM ('VERIFIED_REPAIR', 'HUMAN_REVIEW', 'EXCLUDED');
CREATE TYPE "garageos"."CrmRepairFitSource" AS ENUM ('AUTO', 'HUMAN');

ALTER TABLE "garageos"."CrmProspect"
  ADD COLUMN "repairFit" "garageos"."CrmRepairFit",
  ADD COLUMN "repairFitSource" "garageos"."CrmRepairFitSource",
  ADD COLUMN "repairFitReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "repairFitProtected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "repairFitAt" TIMESTAMP(3),
  ADD COLUMN "repairFitByUserId" TEXT,
  ADD COLUMN "repairFitNote" TEXT;

-- Integrity: a HUMAN decision always carries who/when (and a note for an exclusion is enforced by the service).
ALTER TABLE "garageos"."CrmProspect" ADD CONSTRAINT "CrmProspect_repairFit_check" CHECK (
  ("repairFit" IS NULL) = ("repairFitSource" IS NULL)
  AND ("repairFitSource" IS DISTINCT FROM 'HUMAN' OR ("repairFitByUserId" IS NOT NULL AND "repairFitAt" IS NOT NULL))
);

CREATE INDEX "CrmProspect_repairFit_assignedStaffId_idx" ON "garageos"."CrmProspect"("repairFit", "assignedStaffId");
CREATE INDEX "CrmDiscoveryCandidate_importedProspectId_all_idx" ON "garageos"."CrmDiscoveryCandidate"("importedProspectId");
