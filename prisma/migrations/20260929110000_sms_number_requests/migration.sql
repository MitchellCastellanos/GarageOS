-- El taller pide su número dedicado desde Configuración (REQUESTED); un super
-- admin lo aprueba con un clic desde /platform, lo que dispara la compra real.
-- AlterEnum
ALTER TYPE "garageos"."ShopSmsNumberStatus" ADD VALUE 'REQUESTED';

-- AlterTable
ALTER TABLE "garageos"."ShopSmsNumber" ADD COLUMN     "requestedAt" TIMESTAMP(3),
ADD COLUMN     "requestedByUserId" TEXT;
