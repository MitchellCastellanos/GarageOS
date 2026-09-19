-- Confirmación de email (login/staff) y opt-out de notificaciones de
-- facturación por OWNER. Ver comentarios en prisma/schema.prisma (model User).
-- emailVerified arranca en NULL para usuarios existentes: se les pide
-- confirmar también, igual que a los nuevos (decisión de producto).
ALTER TABLE "garageos"."User" ADD COLUMN IF NOT EXISTS "emailVerified" TIMESTAMP(3);
ALTER TABLE "garageos"."User" ADD COLUMN IF NOT EXISTS "receiveBillingNotifications" BOOLEAN NOT NULL DEFAULT true;
