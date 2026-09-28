-- Historial de citas (paper trail) — ver model AppointmentEvent en prisma/schema.prisma.
CREATE TYPE "garageos"."AppointmentEventType" AS ENUM ('CREATED', 'RESCHEDULED', 'UPDATED', 'CANCELLED', 'REOPENED', 'STATUS_CHANGED', 'CONFIRMED_BY_CLIENT', 'NOTICE_RESENT', 'REMINDER_SENT');

CREATE TYPE "garageos"."AppointmentActorType" AS ENUM ('STAFF', 'CLIENT', 'SYSTEM');

CREATE TABLE "garageos"."AppointmentEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "type" "garageos"."AppointmentEventType" NOT NULL,
    "actorType" "garageos"."AppointmentActorType" NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "notice" TEXT,
    "noticeOutcome" TEXT,
    "smsMessageId" TEXT,
    "emailMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppointmentEvent_appointmentId_createdAt_idx" ON "garageos"."AppointmentEvent"("appointmentId", "createdAt");

CREATE INDEX "AppointmentEvent_shopId_createdAt_idx" ON "garageos"."AppointmentEvent"("shopId", "createdAt");

ALTER TABLE "garageos"."AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "garageos"."AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "garageos"."Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
