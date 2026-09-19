-- Confirmación del "email principal" del taller — ver comentario en
-- prisma/schema.prisma (model Shop). Arranca NULL para talleres existentes;
-- se auto-confirma en el próximo guardado si coincide con el login del OWNER.
ALTER TABLE "garageos"."Shop" ADD COLUMN IF NOT EXISTS "emailVerified" TIMESTAMP(3);
