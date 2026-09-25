-- Preferencia de canal de notificación por cliente (AUTO/SMS/EMAIL/BOTH).
-- CreateEnum
CREATE TYPE "garageos"."ClientNotifyChannel" AS ENUM ('AUTO', 'SMS', 'EMAIL', 'BOTH');

-- AlterTable
ALTER TABLE "garageos"."Client" ADD COLUMN     "notifyChannel" "garageos"."ClientNotifyChannel" NOT NULL DEFAULT 'AUTO';

