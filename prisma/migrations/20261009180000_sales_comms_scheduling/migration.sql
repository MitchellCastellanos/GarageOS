-- CreateEnum
CREATE TYPE "garageos"."CrmIdentityStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "garageos"."CrmThreadStatus" AS ENUM ('OPEN', 'DONE', 'SPAM');

-- CreateEnum
CREATE TYPE "garageos"."CrmEmailDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "garageos"."CrmEmailCategory" AS ENUM ('COMMERCIAL', 'REPLY', 'TRANSACTIONAL');

-- CreateEnum
CREATE TYPE "garageos"."CrmEmailStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'DELAYED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'CANCELLED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "garageos"."CrmSuppressionReason" AS ENUM ('UNSUBSCRIBE', 'HARD_BOUNCE', 'COMPLAINT', 'MANUAL', 'REPLY_OPT_OUT');

-- CreateEnum
CREATE TYPE "garageos"."CrmSendingBasisKind" AS ENUM ('EXPRESS_CONSENT', 'IMPLIED_EXISTING_RELATIONSHIP', 'IMPLIED_PUBLISHED_ADDRESS', 'IMPLIED_DISCLOSED_ADDRESS', 'EXEMPT');

-- CreateEnum
CREATE TYPE "garageos"."CrmSequenceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "garageos"."CrmEnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'STOPPED');

-- CreateEnum
CREATE TYPE "garageos"."CrmMeetingType" AS ENUM ('VIDEO', 'PHONE', 'ON_SITE');

-- CreateEnum
CREATE TYPE "garageos"."CrmMeetingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "garageos"."CrmMeetingOutcome" AS ENUM ('HELD_INTERESTED', 'HELD_NEEDS_FOLLOW_UP', 'HELD_NOT_INTERESTED', 'NO_SHOW', 'RESCHEDULE_REQUESTED');

-- CreateEnum
CREATE TYPE "garageos"."CrmAvailabilityExceptionKind" AS ENUM ('OFF', 'EXTRA');

-- CreateEnum
CREATE TYPE "garageos"."CrmBookingLinkKind" AS ENUM ('GENERAL', 'PROSPECT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "garageos"."CrmActivityType" ADD VALUE 'EMAIL_SENT';
ALTER TYPE "garageos"."CrmActivityType" ADD VALUE 'EMAIL_RECEIVED';
ALTER TYPE "garageos"."CrmActivityType" ADD VALUE 'SEQUENCE';

-- CreateTable
CREATE TABLE "garageos"."CrmCommsSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "sendingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "approvedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inboundDomain" TEXT,
    "legalName" TEXT NOT NULL DEFAULT 'GarageOS',
    "mailingAddress" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "websiteUrl" TEXT NOT NULL DEFAULT 'https://www.garage-os.ca',
    "defaultDailyLimit" INTEGER NOT NULL DEFAULT 30,
    "sendWindowStartHour" INTEGER NOT NULL DEFAULT 8,
    "sendWindowEndHour" INTEGER NOT NULL DEFAULT 17,
    "minNoticeMinutes" INTEGER NOT NULL DEFAULT 240,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 45,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmCommsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmSenderIdentity" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "replyToEmail" TEXT,
    "jobTitle" TEXT,
    "phone" TEXT,
    "signatureText" TEXT,
    "defaultLanguage" "garageos"."CrmLanguage" NOT NULL DEFAULT 'EN',
    "status" "garageos"."CrmIdentityStatus" NOT NULL DEFAULT 'DRAFT',
    "dailyLimit" INTEGER,
    "inboundVerifiedAt" TIMESTAMP(3),
    "sendingCheckedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSenderIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmEmailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "language" "garageos"."CrmLanguage" NOT NULL,
    "version" INTEGER NOT NULL,
    "category" "garageos"."CrmEmailCategory" NOT NULL DEFAULT 'COMMERCIAL',
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "approvedByUserId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmEmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmEmailThread" (
    "id" TEXT NOT NULL,
    "replyKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "prospectId" TEXT,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "identityId" TEXT NOT NULL,
    "ownerStaffId" TEXT,
    "status" "garageos"."CrmThreadStatus" NOT NULL DEFAULT 'OPEN',
    "counterpartyEmail" TEXT,
    "needsReply" BOOLEAN NOT NULL DEFAULT false,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerSeenAt" TIMESTAMP(3),
    "language" "garageos"."CrmLanguage" NOT NULL DEFAULT 'UNKNOWN',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmEmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmEmailMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "direction" "garageos"."CrmEmailDirection" NOT NULL,
    "category" "garageos"."CrmEmailCategory" NOT NULL DEFAULT 'COMMERCIAL',
    "status" "garageos"."CrmEmailStatus" NOT NULL DEFAULT 'DRAFT',
    "authorUserId" TEXT,
    "prospectId" TEXT,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "toAddresses" TEXT[],
    "ccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "providerMessageId" TEXT,
    "internetMessageId" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "altMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isAutomated" BOOLEAN NOT NULL DEFAULT false,
    "templateKey" TEXT,
    "templateVersion" INTEGER,
    "language" "garageos"."CrmLanguage",
    "languageSource" TEXT,
    "sequenceEnrollmentId" TEXT,
    "sequenceStepIndex" INTEGER,
    "meetingId" TEXT,
    "meetingEmailKind" TEXT,
    "idempotencyKey" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "inboundProviderEmailId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmEmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmEmailAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmEmailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmEmailNote" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmEmailNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmEmailDeliveryEvent" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "messageId" TEXT,
    "type" TEXT NOT NULL,
    "providerEmailId" TEXT,
    "detail" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmEmailDeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmEmailSuppression" (
    "id" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "reason" "garageos"."CrmSuppressionReason" NOT NULL,
    "source" TEXT NOT NULL,
    "messageId" TEXT,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),
    "liftedByUserId" TEXT,
    "liftNote" TEXT,

    CONSTRAINT "CrmEmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmSendingBasis" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "kind" "garageos"."CrmSendingBasisKind" NOT NULL,
    "evidence" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "recordedByUserId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CrmSendingBasis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmSequence" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "garageos"."CrmSequenceStatus" NOT NULL DEFAULT 'DRAFT',
    "businessDaysOnly" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "activatedByUserId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmSequenceStep" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "dayOffset" INTEGER NOT NULL,
    "templateKey" TEXT NOT NULL,

    CONSTRAINT "CrmSequenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmSequenceEnrollment" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "staffId" TEXT NOT NULL,
    "status" "garageos"."CrmEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "nextStepIndex" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3),
    "languageOverride" "garageos"."CrmLanguage",
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "enrolledByUserId" TEXT NOT NULL,
    "stoppedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSequenceEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmAvailabilityException" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "kind" "garageos"."CrmAvailabilityExceptionKind" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmAvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmBookingLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "kind" "garageos"."CrmBookingLinkKind" NOT NULL,
    "staffId" TEXT NOT NULL,
    "prospectId" TEXT,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "language" "garageos"."CrmLanguage",
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CrmBookingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmMeeting" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "prospectId" TEXT,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "bookingLinkId" TEXT,
    "type" "garageos"."CrmMeetingType" NOT NULL DEFAULT 'VIDEO',
    "status" "garageos"."CrmMeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "staffTimezone" TEXT NOT NULL,
    "attendeeTimezone" TEXT NOT NULL,
    "attendeeName" TEXT NOT NULL,
    "attendeeEmail" TEXT NOT NULL,
    "attendeePhone" TEXT,
    "locationDetail" TEXT,
    "language" "garageos"."CrmLanguage" NOT NULL DEFAULT 'EN',
    "languageSource" TEXT,
    "agenda" TEXT,
    "notes" TEXT,
    "outcome" "garageos"."CrmMeetingOutcome",
    "outcomeNotes" TEXT,
    "manageToken" TEXT NOT NULL,
    "prepTaskId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "rescheduledFromId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmSellerCalendar" (
    "staffId" TEXT NOT NULL,
    "meetingTypes" "garageos"."CrmMeetingType"[] DEFAULT ARRAY['VIDEO', 'PHONE']::"garageos"."CrmMeetingType"[],
    "durations" INTEGER[] DEFAULT ARRAY[30]::INTEGER[],
    "joinUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSellerCalendar_pkey" PRIMARY KEY ("staffId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmSenderIdentity_staffId_key" ON "garageos"."CrmSenderIdentity"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSenderIdentity_fromEmail_key" ON "garageos"."CrmSenderIdentity"("fromEmail");

-- CreateIndex
CREATE INDEX "CrmSenderIdentity_status_idx" ON "garageos"."CrmSenderIdentity"("status");

-- CreateIndex
CREATE INDEX "CrmEmailTemplate_key_language_active_idx" ON "garageos"."CrmEmailTemplate"("key", "language", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CrmEmailTemplate_key_language_version_key" ON "garageos"."CrmEmailTemplate"("key", "language", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CrmEmailThread_replyKey_key" ON "garageos"."CrmEmailThread"("replyKey");

-- CreateIndex
CREATE INDEX "CrmEmailThread_ownerStaffId_status_lastMessageAt_idx" ON "garageos"."CrmEmailThread"("ownerStaffId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "CrmEmailThread_prospectId_lastMessageAt_idx" ON "garageos"."CrmEmailThread"("prospectId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "CrmEmailThread_counterpartyEmail_idx" ON "garageos"."CrmEmailThread"("counterpartyEmail");

-- CreateIndex
CREATE INDEX "CrmEmailThread_status_needsReply_idx" ON "garageos"."CrmEmailThread"("status", "needsReply");

-- CreateIndex
CREATE UNIQUE INDEX "CrmEmailMessage_idempotencyKey_key" ON "garageos"."CrmEmailMessage"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CrmEmailMessage_inboundProviderEmailId_key" ON "garageos"."CrmEmailMessage"("inboundProviderEmailId");

-- CreateIndex
CREATE INDEX "CrmEmailMessage_threadId_createdAt_idx" ON "garageos"."CrmEmailMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmEmailMessage_status_nextAttemptAt_idx" ON "garageos"."CrmEmailMessage"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "CrmEmailMessage_providerMessageId_idx" ON "garageos"."CrmEmailMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "CrmEmailMessage_internetMessageId_idx" ON "garageos"."CrmEmailMessage"("internetMessageId");

-- CreateIndex
CREATE INDEX "CrmEmailMessage_meetingId_idx" ON "garageos"."CrmEmailMessage"("meetingId");

-- CreateIndex
CREATE INDEX "CrmEmailMessage_sequenceEnrollmentId_idx" ON "garageos"."CrmEmailMessage"("sequenceEnrollmentId");

-- CreateIndex
CREATE INDEX "CrmEmailMessage_authorUserId_status_idx" ON "garageos"."CrmEmailMessage"("authorUserId", "status");

-- CreateIndex
CREATE INDEX "CrmEmailMessage_identityId_direction_sentAt_idx" ON "garageos"."CrmEmailMessage"("identityId", "direction", "sentAt");

-- CreateIndex
CREATE INDEX "CrmEmailAttachment_messageId_idx" ON "garageos"."CrmEmailAttachment"("messageId");

-- CreateIndex
CREATE INDEX "CrmEmailNote_threadId_createdAt_idx" ON "garageos"."CrmEmailNote"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmEmailDeliveryEvent_providerEventId_key" ON "garageos"."CrmEmailDeliveryEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "CrmEmailDeliveryEvent_messageId_idx" ON "garageos"."CrmEmailDeliveryEvent"("messageId");

-- CreateIndex
CREATE INDEX "CrmEmailDeliveryEvent_providerEmailId_idx" ON "garageos"."CrmEmailDeliveryEvent"("providerEmailId");

-- CreateIndex
CREATE INDEX "CrmEmailSuppression_emailNormalized_liftedAt_idx" ON "garageos"."CrmEmailSuppression"("emailNormalized", "liftedAt");

-- CreateIndex
CREATE INDEX "CrmEmailSuppression_createdAt_idx" ON "garageos"."CrmEmailSuppression"("createdAt");

-- CreateIndex
CREATE INDEX "CrmSendingBasis_contactId_recordedAt_idx" ON "garageos"."CrmSendingBasis"("contactId", "recordedAt");

-- CreateIndex
CREATE INDEX "CrmSequence_status_idx" ON "garageos"."CrmSequence"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSequenceStep_sequenceId_stepIndex_key" ON "garageos"."CrmSequenceStep"("sequenceId", "stepIndex");

-- CreateIndex
CREATE INDEX "CrmSequenceEnrollment_status_nextRunAt_idx" ON "garageos"."CrmSequenceEnrollment"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "CrmSequenceEnrollment_prospectId_status_idx" ON "garageos"."CrmSequenceEnrollment"("prospectId", "status");

-- CreateIndex
CREATE INDEX "CrmSequenceEnrollment_contactId_status_idx" ON "garageos"."CrmSequenceEnrollment"("contactId", "status");

-- CreateIndex
CREATE INDEX "CrmSequenceEnrollment_staffId_status_idx" ON "garageos"."CrmSequenceEnrollment"("staffId", "status");

-- CreateIndex
CREATE INDEX "CrmAvailabilityException_staffId_startsAt_idx" ON "garageos"."CrmAvailabilityException"("staffId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmBookingLink_token_key" ON "garageos"."CrmBookingLink"("token");

-- CreateIndex
CREATE INDEX "CrmBookingLink_staffId_kind_active_idx" ON "garageos"."CrmBookingLink"("staffId", "kind", "active");

-- CreateIndex
CREATE INDEX "CrmBookingLink_prospectId_idx" ON "garageos"."CrmBookingLink"("prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmMeeting_manageToken_key" ON "garageos"."CrmMeeting"("manageToken");

-- CreateIndex
CREATE INDEX "CrmMeeting_staffId_startsAt_idx" ON "garageos"."CrmMeeting"("staffId", "startsAt");

-- CreateIndex
CREATE INDEX "CrmMeeting_prospectId_startsAt_idx" ON "garageos"."CrmMeeting"("prospectId", "startsAt");

-- CreateIndex
CREATE INDEX "CrmMeeting_status_startsAt_idx" ON "garageos"."CrmMeeting"("status", "startsAt");

-- CreateIndex
CREATE INDEX "CrmMeeting_attendeeEmail_idx" ON "garageos"."CrmMeeting"("attendeeEmail");

-- AddForeignKey
ALTER TABLE "garageos"."CrmSenderIdentity" ADD CONSTRAINT "CrmSenderIdentity_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "garageos"."PlatformSalesStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmEmailThread" ADD CONSTRAINT "CrmEmailThread_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "garageos"."CrmProspect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmEmailThread" ADD CONSTRAINT "CrmEmailThread_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "garageos"."CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmEmailThread" ADD CONSTRAINT "CrmEmailThread_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "garageos"."CrmSenderIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmEmailThread" ADD CONSTRAINT "CrmEmailThread_ownerStaffId_fkey" FOREIGN KEY ("ownerStaffId") REFERENCES "garageos"."PlatformSalesStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmEmailMessage" ADD CONSTRAINT "CrmEmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "garageos"."CrmEmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmEmailMessage" ADD CONSTRAINT "CrmEmailMessage_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "garageos"."CrmSenderIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmEmailAttachment" ADD CONSTRAINT "CrmEmailAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "garageos"."CrmEmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmEmailNote" ADD CONSTRAINT "CrmEmailNote_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "garageos"."CrmEmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmEmailDeliveryEvent" ADD CONSTRAINT "CrmEmailDeliveryEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "garageos"."CrmEmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmSendingBasis" ADD CONSTRAINT "CrmSendingBasis_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "garageos"."CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmSequenceStep" ADD CONSTRAINT "CrmSequenceStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "garageos"."CrmSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmSequenceEnrollment" ADD CONSTRAINT "CrmSequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "garageos"."CrmSequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmSequenceEnrollment" ADD CONSTRAINT "CrmSequenceEnrollment_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "garageos"."CrmProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmSequenceEnrollment" ADD CONSTRAINT "CrmSequenceEnrollment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "garageos"."CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmSequenceEnrollment" ADD CONSTRAINT "CrmSequenceEnrollment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "garageos"."PlatformSalesStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmAvailabilityException" ADD CONSTRAINT "CrmAvailabilityException_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "garageos"."PlatformSalesStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmBookingLink" ADD CONSTRAINT "CrmBookingLink_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "garageos"."PlatformSalesStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmMeeting" ADD CONSTRAINT "CrmMeeting_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "garageos"."PlatformSalesStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmMeeting" ADD CONSTRAINT "CrmMeeting_bookingLinkId_fkey" FOREIGN KEY ("bookingLinkId") REFERENCES "garageos"."CrmBookingLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmSellerCalendar" ADD CONSTRAINT "CrmSellerCalendar_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "garageos"."PlatformSalesStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Database-enforced invariants (the application also checks them; these are the race-proof backstop).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- A provider message id maps to at most one stored email.
CREATE UNIQUE INDEX "CrmEmailMessage_providerMessageId_key" ON "garageos"."CrmEmailMessage"("providerMessageId") WHERE "providerMessageId" IS NOT NULL;

-- At most one ACTIVE suppression per address (lifting sets liftedAt; history rows stay).
CREATE UNIQUE INDEX "CrmEmailSuppression_one_active_per_email" ON "garageos"."CrmEmailSuppression"("emailNormalized") WHERE "liftedAt" IS NULL;

-- A contact can be in a given sequence only once at a time (ACTIVE or PAUSED).
CREATE UNIQUE INDEX "CrmSequenceEnrollment_one_live_per_contact_sequence" ON "garageos"."CrmSequenceEnrollment"("sequenceId", "contactId") WHERE "status" IN ('ACTIVE', 'PAUSED');

-- One live general booking link per seller.
CREATE UNIQUE INDEX "CrmBookingLink_one_active_general_per_staff" ON "garageos"."CrmBookingLink"("staffId") WHERE "kind" = 'GENERAL' AND "active" = true;

-- Two scheduled meetings can never start at the same instant for a seller (identical-start race backstop;
-- overlap is prevented by serializing bookings on the seller row — see lib/sales-comms/meetings.ts).
CREATE UNIQUE INDEX "CrmMeeting_one_scheduled_start_per_staff" ON "garageos"."CrmMeeting"("staffId", "startsAt") WHERE "status" = 'SCHEDULED';

ALTER TABLE "garageos"."CrmMeeting" ADD CONSTRAINT "CrmMeeting_time_order" CHECK ("endsAt" > "startsAt");
ALTER TABLE "garageos"."CrmMeeting" ADD CONSTRAINT "CrmMeeting_duration_range" CHECK ("durationMinutes" BETWEEN 5 AND 480);
ALTER TABLE "garageos"."CrmAvailabilityException" ADD CONSTRAINT "CrmAvailabilityException_time_order" CHECK ("endsAt" > "startsAt");
ALTER TABLE "garageos"."CrmCommsSettings" ADD CONSTRAINT "CrmCommsSettings_hours" CHECK ("sendWindowStartHour" BETWEEN 0 AND 23 AND "sendWindowEndHour" BETWEEN 1 AND 24 AND "sendWindowStartHour" < "sendWindowEndHour");
ALTER TABLE "garageos"."CrmCommsSettings" ADD CONSTRAINT "CrmCommsSettings_limits" CHECK ("defaultDailyLimit" BETWEEN 0 AND 500 AND "minNoticeMinutes" >= 0 AND "maxAdvanceDays" BETWEEN 1 AND 365);
ALTER TABLE "garageos"."CrmSenderIdentity" ADD CONSTRAINT "CrmSenderIdentity_email_lower" CHECK ("fromEmail" = lower("fromEmail"));
ALTER TABLE "garageos"."CrmSequenceStep" ADD CONSTRAINT "CrmSequenceStep_offset" CHECK ("dayOffset" BETWEEN 0 AND 120 AND "stepIndex" >= 0);

-- The singleton settings row. sendingEnabled defaults to FALSE: nothing is sent until Super Admin turns it on.
INSERT INTO "garageos"."CrmCommsSettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
