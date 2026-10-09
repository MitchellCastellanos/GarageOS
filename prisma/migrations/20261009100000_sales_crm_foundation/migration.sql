-- Sales CRM foundation (Agent 1). Purely additive: new enums/tables plus one nullable column on SalesDemo.
-- No existing data is read, rewritten or dropped.

-- CreateEnum
CREATE TYPE "garageos"."PlatformSalesRole" AS ENUM ('SALES_REP', 'SALES_MANAGER');

-- CreateEnum
CREATE TYPE "garageos"."PlatformStaffStatus" AS ENUM ('INVITED', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "garageos"."CrmLanguage" AS ENUM ('FR', 'EN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "garageos"."CrmProspectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "garageos"."CrmIndustry" AS ENUM ('GENERAL_REPAIR', 'TIRE_SHOP', 'BODY_SHOP', 'TRANSMISSION', 'DIAGNOSTIC', 'SPECIALTY', 'FLEET', 'OTHER');

-- CreateEnum
CREATE TYPE "garageos"."CrmShopSize" AS ENUM ('SOLO', 'SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "garageos"."CrmLeadSource" AS ENUM ('REFERRAL', 'WEBSITE', 'COLD_OUTBOUND', 'EVENT', 'DIRECTORY', 'PARTNER', 'IMPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "garageos"."CrmPipelineStage" AS ENUM ('NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED', 'DEMO_SCHEDULED', 'DEMO_COMPLETED', 'DECISION', 'WON', 'LOST', 'UNQUALIFIED', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "garageos"."CrmLossReason" AS ENUM ('PRICE', 'COMPETITOR', 'NO_RESPONSE', 'NOT_READY', 'MISSING_FEATURES', 'CLOSED_BUSINESS', 'OTHER');

-- CreateEnum
CREATE TYPE "garageos"."CrmLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "garageos"."CrmNeedSeverity" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "garageos"."CrmEvidenceBasis" AS ENUM ('CONFIRMED', 'INFERRED');

-- CreateEnum
CREATE TYPE "garageos"."CrmNeedCategory" AS ENUM ('BOOKING', 'INVOICING', 'WORK_ORDERS', 'INSPECTIONS', 'COMMUNICATIONS', 'RETENTION', 'INVENTORY', 'REPORTING', 'MULTI_LOCATION');

-- CreateEnum
CREATE TYPE "garageos"."CrmActivityType" AS ENUM ('NOTE', 'CALL', 'MEETING', 'EMAIL_LOGGED', 'STAGE_CHANGE', 'ASSIGNMENT', 'DEMO', 'SYSTEM');

-- CreateEnum
CREATE TYPE "garageos"."CrmActivityOutcome" AS ENUM ('CONNECTED', 'VOICEMAIL', 'NO_ANSWER', 'WRONG_NUMBER', 'INTERESTED', 'NOT_INTERESTED', 'FOLLOW_UP_NEEDED');

-- CreateEnum
CREATE TYPE "garageos"."CrmTaskType" AS ENUM ('FOLLOW_UP', 'CALL', 'EMAIL', 'DEMO_PREP', 'OTHER');

-- CreateEnum
CREATE TYPE "garageos"."CrmTaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "garageos"."CrmImportStatus" AS ENUM ('PREVIEWED', 'IMPORTING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "garageos"."SalesDemo" ADD COLUMN     "crmOpportunityId" TEXT;

-- CreateTable
CREATE TABLE "garageos"."PlatformSalesStaff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "garageos"."PlatformSalesRole" NOT NULL DEFAULT 'SALES_REP',
    "status" "garageos"."PlatformStaffStatus" NOT NULL DEFAULT 'INVITED',
    "managerId" TEXT,
    "title" TEXT,
    "phone" TEXT,
    "territories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uiLocale" "garageos"."InvoiceLanguage" NOT NULL DEFAULT 'EN',
    "timezone" TEXT NOT NULL DEFAULT 'America/Toronto',
    "displayName" TEXT,
    "signatureText" TEXT,
    "bookingSlug" TEXT,
    "bookingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultMeetingMinutes" INTEGER NOT NULL DEFAULT 30,
    "meetingBufferMinutes" INTEGER NOT NULL DEFAULT 10,
    "availability" JSONB NOT NULL DEFAULT '{}',
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "inviteSentAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedByUserId" TEXT,
    "deactivationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSalesStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmImportBatch" (
    "id" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "assignedStaffId" TEXT,
    "filename" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" "garageos"."CrmImportStatus" NOT NULL DEFAULT 'PREVIEWED',
    "rows" JSONB,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "defaultSource" "garageos"."CrmLeadSource" NOT NULL DEFAULT 'IMPORT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CrmImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmProspect" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "website" TEXT,
    "websiteDomain" TEXT,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "phone" TEXT,
    "phoneDigits" TEXT,
    "email" TEXT,
    "industry" "garageos"."CrmIndustry",
    "shopSize" "garageos"."CrmShopSize",
    "locationCount" INTEGER NOT NULL DEFAULT 1,
    "currentSoftware" TEXT,
    "source" "garageos"."CrmLeadSource" NOT NULL DEFAULT 'OTHER',
    "sourceDetail" TEXT,
    "preferredLanguage" "garageos"."CrmLanguage" NOT NULL DEFAULT 'UNKNOWN',
    "status" "garageos"."CrmProspectStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedStaffId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "doNotContactAt" TIMESTAMP(3),
    "importBatchId" TEXT,
    "mergedIntoId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmContact" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "emailNormalized" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isDecisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "preferredLanguage" "garageos"."CrmLanguage",
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmOpportunity" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "assignedStaffId" TEXT,
    "stage" "garageos"."CrmPipelineStage" NOT NULL DEFAULT 'NEW',
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "urgency" "garageos"."CrmLevel",
    "estimatedPlan" "garageos"."Plan",
    "estimatedMrrCents" INTEGER,
    "expectedCloseDate" TIMESTAMP(3),
    "lossReason" "garageos"."CrmLossReason",
    "closeNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "wonAt" TIMESTAMP(3),
    "convertedShopId" TEXT,
    "fitScore" INTEGER,
    "fitBreakdown" JSONB NOT NULL DEFAULT '{}',
    "intentScore" INTEGER,
    "intentBreakdown" JSONB NOT NULL DEFAULT '{}',
    "scoreComputedAt" TIMESTAMP(3),
    "fitScoreOverride" INTEGER,
    "fitOverrideReason" TEXT,
    "intentScoreOverride" INTEGER,
    "intentOverrideReason" TEXT,
    "overriddenByUserId" TEXT,
    "overriddenAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmStageEvent" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "fromStage" "garageos"."CrmPipelineStage",
    "toStage" "garageos"."CrmPipelineStage" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmStageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmNeedDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" "garageos"."CrmNeedCategory" NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelFr" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionFr" TEXT,
    "suggestedFeature" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmNeedDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmProspectNeed" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "severity" "garageos"."CrmNeedSeverity" NOT NULL DEFAULT 'MEDIUM',
    "priority" "garageos"."CrmLevel" NOT NULL DEFAULT 'MEDIUM',
    "basis" "garageos"."CrmEvidenceBasis" NOT NULL DEFAULT 'INFERRED',
    "evidence" TEXT,
    "notes" TEXT,
    "assessedByUserId" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmProspectNeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmActivity" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "contactId" TEXT,
    "type" "garageos"."CrmActivityType" NOT NULL,
    "outcome" "garageos"."CrmActivityOutcome",
    "subject" TEXT,
    "body" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmTask" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "assignedStaffId" TEXT,
    "type" "garageos"."CrmTaskType" NOT NULL DEFAULT 'FOLLOW_UP',
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "priority" "garageos"."CrmLevel" NOT NULL DEFAULT 'MEDIUM',
    "status" "garageos"."CrmTaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmAuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "prospectId" TEXT,
    "staffId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSalesStaff_userId_key" ON "garageos"."PlatformSalesStaff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSalesStaff_bookingSlug_key" ON "garageos"."PlatformSalesStaff"("bookingSlug");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSalesStaff_inviteTokenHash_key" ON "garageos"."PlatformSalesStaff"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "PlatformSalesStaff_status_role_idx" ON "garageos"."PlatformSalesStaff"("status", "role");

-- CreateIndex
CREATE INDEX "PlatformSalesStaff_managerId_idx" ON "garageos"."PlatformSalesStaff"("managerId");

-- CreateIndex
CREATE INDEX "CrmImportBatch_createdByUserId_createdAt_idx" ON "garageos"."CrmImportBatch"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmImportBatch_fileHash_idx" ON "garageos"."CrmImportBatch"("fileHash");

-- CreateIndex
CREATE INDEX "CrmProspect_assignedStaffId_status_idx" ON "garageos"."CrmProspect"("assignedStaffId", "status");

-- CreateIndex
CREATE INDEX "CrmProspect_status_createdAt_idx" ON "garageos"."CrmProspect"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CrmProspect_nameNormalized_idx" ON "garageos"."CrmProspect"("nameNormalized");

-- CreateIndex
CREATE INDEX "CrmProspect_websiteDomain_idx" ON "garageos"."CrmProspect"("websiteDomain");

-- CreateIndex
CREATE INDEX "CrmProspect_phoneDigits_idx" ON "garageos"."CrmProspect"("phoneDigits");

-- CreateIndex
CREATE INDEX "CrmProspect_city_idx" ON "garageos"."CrmProspect"("city");

-- CreateIndex
CREATE INDEX "CrmContact_prospectId_archivedAt_idx" ON "garageos"."CrmContact"("prospectId", "archivedAt");

-- CreateIndex
CREATE INDEX "CrmContact_emailNormalized_idx" ON "garageos"."CrmContact"("emailNormalized");

-- CreateIndex
CREATE INDEX "CrmOpportunity_assignedStaffId_stage_idx" ON "garageos"."CrmOpportunity"("assignedStaffId", "stage");

-- CreateIndex
CREATE INDEX "CrmOpportunity_stage_stageChangedAt_idx" ON "garageos"."CrmOpportunity"("stage", "stageChangedAt");

-- CreateIndex
CREATE INDEX "CrmOpportunity_prospectId_stage_idx" ON "garageos"."CrmOpportunity"("prospectId", "stage");

-- CreateIndex
CREATE INDEX "CrmStageEvent_opportunityId_createdAt_idx" ON "garageos"."CrmStageEvent"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmStageEvent_toStage_createdAt_idx" ON "garageos"."CrmStageEvent"("toStage", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmNeedDefinition_key_key" ON "garageos"."CrmNeedDefinition"("key");

-- CreateIndex
CREATE INDEX "CrmNeedDefinition_active_sortOrder_idx" ON "garageos"."CrmNeedDefinition"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "CrmProspectNeed_definitionId_idx" ON "garageos"."CrmProspectNeed"("definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmProspectNeed_prospectId_definitionId_key" ON "garageos"."CrmProspectNeed"("prospectId", "definitionId");

-- CreateIndex
CREATE INDEX "CrmActivity_prospectId_occurredAt_idx" ON "garageos"."CrmActivity"("prospectId", "occurredAt");

-- CreateIndex
CREATE INDEX "CrmActivity_opportunityId_occurredAt_idx" ON "garageos"."CrmActivity"("opportunityId", "occurredAt");

-- CreateIndex
CREATE INDEX "CrmActivity_authorUserId_occurredAt_idx" ON "garageos"."CrmActivity"("authorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "CrmTask_assignedStaffId_status_dueAt_idx" ON "garageos"."CrmTask"("assignedStaffId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "CrmTask_status_dueAt_idx" ON "garageos"."CrmTask"("status", "dueAt");

-- CreateIndex
CREATE INDEX "CrmTask_prospectId_status_idx" ON "garageos"."CrmTask"("prospectId", "status");

-- CreateIndex
CREATE INDEX "CrmAuditEvent_entityType_entityId_idx" ON "garageos"."CrmAuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "CrmAuditEvent_prospectId_createdAt_idx" ON "garageos"."CrmAuditEvent"("prospectId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmAuditEvent_staffId_createdAt_idx" ON "garageos"."CrmAuditEvent"("staffId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmAuditEvent_actorUserId_createdAt_idx" ON "garageos"."CrmAuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesDemo_crmOpportunityId_idx" ON "garageos"."SalesDemo"("crmOpportunityId");

-- AddForeignKey
ALTER TABLE "garageos"."SalesDemo" ADD CONSTRAINT "SalesDemo_crmOpportunityId_fkey" FOREIGN KEY ("crmOpportunityId") REFERENCES "garageos"."CrmOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."PlatformSalesStaff" ADD CONSTRAINT "PlatformSalesStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "garageos"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."PlatformSalesStaff" ADD CONSTRAINT "PlatformSalesStaff_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "garageos"."PlatformSalesStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmProspect" ADD CONSTRAINT "CrmProspect_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "garageos"."PlatformSalesStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmProspect" ADD CONSTRAINT "CrmProspect_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "garageos"."CrmImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmContact" ADD CONSTRAINT "CrmContact_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "garageos"."CrmProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "garageos"."CrmProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "garageos"."PlatformSalesStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmStageEvent" ADD CONSTRAINT "CrmStageEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "garageos"."CrmOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmProspectNeed" ADD CONSTRAINT "CrmProspectNeed_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "garageos"."CrmProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmProspectNeed" ADD CONSTRAINT "CrmProspectNeed_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "garageos"."CrmNeedDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmActivity" ADD CONSTRAINT "CrmActivity_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "garageos"."CrmProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmActivity" ADD CONSTRAINT "CrmActivity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "garageos"."CrmOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmActivity" ADD CONSTRAINT "CrmActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "garageos"."CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmActivity" ADD CONSTRAINT "CrmActivity_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "garageos"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmTask" ADD CONSTRAINT "CrmTask_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "garageos"."CrmProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmTask" ADD CONSTRAINT "CrmTask_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "garageos"."CrmOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmTask" ADD CONSTRAINT "CrmTask_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "garageos"."PlatformSalesStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Invariants Prisma cannot express ─────────────────────────────────────────────────────────

-- At most ONE open (non-terminal) opportunity per prospect: no accidental duplicate opportunities, race-safe.
CREATE UNIQUE INDEX "CrmOpportunity_one_open_per_prospect" ON "garageos"."CrmOpportunity"("prospectId")
  WHERE "stage" NOT IN ('WON', 'LOST', 'UNQUALIFIED', 'DO_NOT_CONTACT');

-- At most one active primary contact per prospect.
CREATE UNIQUE INDEX "CrmContact_one_primary_per_prospect" ON "garageos"."CrmContact"("prospectId")
  WHERE "isPrimary" AND "archivedAt" IS NULL;

ALTER TABLE "garageos"."CrmContact" ADD CONSTRAINT "CrmContact_language_override_known"
  CHECK ("preferredLanguage" IS NULL OR "preferredLanguage" <> 'UNKNOWN');
ALTER TABLE "garageos"."CrmProspect" ADD CONSTRAINT "CrmProspect_locationCount_positive" CHECK ("locationCount" BETWEEN 1 AND 1000);
ALTER TABLE "garageos"."CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_scores_range" CHECK (
  ("fitScore" IS NULL OR "fitScore" BETWEEN 0 AND 100) AND ("intentScore" IS NULL OR "intentScore" BETWEEN 0 AND 100) AND
  ("fitScoreOverride" IS NULL OR "fitScoreOverride" BETWEEN 0 AND 100) AND ("intentScoreOverride" IS NULL OR "intentScoreOverride" BETWEEN 0 AND 100));
ALTER TABLE "garageos"."CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_mrr_nonnegative" CHECK ("estimatedMrrCents" IS NULL OR "estimatedMrrCents" >= 0);
ALTER TABLE "garageos"."PlatformSalesStaff" ADD CONSTRAINT "PlatformSalesStaff_meeting_bounds" CHECK (
  "defaultMeetingMinutes" BETWEEN 5 AND 480 AND "meetingBufferMinutes" BETWEEN 0 AND 240);
ALTER TABLE "garageos"."PlatformSalesStaff" ADD CONSTRAINT "PlatformSalesStaff_invite_hash_format" CHECK ("inviteTokenHash" IS NULL OR "inviteTokenHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "garageos"."PlatformSalesStaff" ADD CONSTRAINT "PlatformSalesStaff_ui_locale" CHECK ("uiLocale" IN ('EN', 'FR'));
ALTER TABLE "garageos"."CrmNeedDefinition" ADD CONSTRAINT "CrmNeedDefinition_weight_range" CHECK ("weight" BETWEEN 1 AND 30);

-- ── Built-in needs taxonomy (configurable afterwards by Super Admin; keys are stable contracts) ──
INSERT INTO "garageos"."CrmNeedDefinition" ("id", "key", "category", "labelEn", "labelFr", "descriptionEn", "descriptionFr", "suggestedFeature", "weight", "builtIn", "sortOrder", "updatedAt") VALUES
 ('crmneed_booking_online', 'booking_online', 'BOOKING', 'Online booking', 'Prise de rendez-vous en ligne', 'Customers cannot book online or the shop manages the schedule by phone/paper.', 'Les clients ne peuvent pas réserver en ligne ou l’atelier gère l’horaire par téléphone/papier.', 'booking', 14, true, 10, CURRENT_TIMESTAMP),
 ('crmneed_invoicing_quotes', 'invoicing_quotes', 'INVOICING', 'Quotes & invoices', 'Soumissions et factures', 'Estimates and invoices are manual, inconsistent or slow to send.', 'Les soumissions et factures sont manuelles, inégales ou lentes à envoyer.', 'invoices', 12, true, 20, CURRENT_TIMESTAMP),
 ('crmneed_work_orders', 'work_orders', 'WORK_ORDERS', 'Work orders', 'Ordres de travail', 'Jobs are not tracked digitally from intake to completion.', 'Les travaux ne sont pas suivis numériquement de la réception à la livraison.', 'work-orders', 12, true, 30, CURRENT_TIMESTAMP),
 ('crmneed_inspections', 'inspections', 'INSPECTIONS', 'Digital inspections', 'Inspections numériques', 'Vehicle inspections are on paper or not shared with the customer.', 'Les inspections de véhicules sont sur papier ou non partagées avec le client.', 'dvi', 10, true, 40, CURRENT_TIMESTAMP),
 ('crmneed_communications', 'communications', 'COMMUNICATIONS', 'Customer communications', 'Communications avec les clients', 'Customer updates and approvals rely on manual calls and texts.', 'Les mises à jour et approbations des clients reposent sur des appels et textos manuels.', 'communications', 10, true, 50, CURRENT_TIMESTAMP),
 ('crmneed_retention', 'retention', 'RETENTION', 'Retention & reminders', 'Fidélisation et rappels', 'No systematic service reminders or repeat-visit follow-up.', 'Aucun rappel d’entretien systématique ni suivi des clients récurrents.', 'reminders', 10, true, 60, CURRENT_TIMESTAMP),
 ('crmneed_inventory', 'inventory', 'INVENTORY', 'Parts inventory', 'Inventaire de pièces', 'Parts and stock levels are not tracked reliably.', 'Les pièces et les niveaux de stock ne sont pas suivis de façon fiable.', 'inventory', 6, true, 70, CURRENT_TIMESTAMP),
 ('crmneed_reporting', 'reporting', 'REPORTING', 'Reporting & visibility', 'Rapports et visibilité', 'The owner lacks clear revenue, labour and performance numbers.', 'Le propriétaire manque de chiffres clairs sur les revenus, la main-d’œuvre et la performance.', 'reports', 8, true, 80, CURRENT_TIMESTAMP),
 ('crmneed_multi_location', 'multi_location', 'MULTI_LOCATION', 'Multi-location management', 'Gestion multi-succursales', 'Several locations need a single consolidated view.', 'Plusieurs succursales nécessitent une vue consolidée.', 'multi-location', 6, true, 90, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
