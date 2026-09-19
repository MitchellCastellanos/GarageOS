-- Marca cuándo el taller vio por última vez su conversación de soporte —
-- alimenta el punto de "mensaje nuevo" en el sidebar (ver src/actions/support.ts).
ALTER TABLE "garageos"."PlatformConversation" ADD COLUMN IF NOT EXISTS "shopReadAt" TIMESTAMP(3);
