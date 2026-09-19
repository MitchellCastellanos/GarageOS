-- AlterTable
ALTER TABLE "garageos"."Shop" ADD COLUMN "etransferEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "garageos"."Shop" ADD COLUMN "etransferEmail" TEXT;
