-- Contact discovery staging (additive). A discovered address lives here until a person accepts it; nothing here is a CRM contact, a CASL basis or an enrollment.
CREATE TABLE "garageos"."CrmDiscoveredContact" (
  "id" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceDataset" TEXT,
  "sourceUrl" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "capturedByUserId" TEXT,
  "syntaxValid" BOOLEAN NOT NULL,
  "roleBased" BOOLEAN NOT NULL,
  "freeMailbox" BOOLEAN NOT NULL,
  "mxStatus" TEXT NOT NULL DEFAULT 'UNCHECKED',
  "mxCheckedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "promotedContactId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmDiscoveredContact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmDiscoveredContact_source_check" CHECK ("source" IN ('OVERTURE_PUBLISHED','WEBSITE_PAGE','MANUAL','PROVIDER')),
  CONSTRAINT "CrmDiscoveredContact_status_check" CHECK ("status" IN ('PENDING','ACCEPTED','REJECTED')),
  CONSTRAINT "CrmDiscoveredContact_mx_check" CHECK ("mxStatus" IN ('UNCHECKED','HAS_MX','NO_MX')),
  CONSTRAINT "CrmDiscoveredContact_email_lower_check" CHECK ("emailNormalized" = lower("emailNormalized"))
);
CREATE UNIQUE INDEX "CrmDiscoveredContact_prospectId_emailNormalized_key" ON "garageos"."CrmDiscoveredContact"("prospectId", "emailNormalized");
CREATE INDEX "CrmDiscoveredContact_status_createdAt_idx" ON "garageos"."CrmDiscoveredContact"("status", "createdAt");
ALTER TABLE "garageos"."CrmDiscoveredContact" ADD CONSTRAINT "CrmDiscoveredContact_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "garageos"."CrmProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
