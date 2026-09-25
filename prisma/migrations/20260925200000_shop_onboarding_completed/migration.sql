-- Asistente de arranque guiado (business info -> fiscal/logo -> servicios ->
-- horarios -> diseño de la página de reservas -> compartir). Ver
-- src/app/admin/(shop)/onboarding.
--
-- Talleres existentes se dan por completados (usan su createdAt como marca)
-- para no mandarlos al asistente en su próximo login; los talleres nuevos
-- quedan en NULL y /admin los redirige ahí hasta que lo terminen.
ALTER TABLE "garageos"."Shop"
  ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

UPDATE "garageos"."Shop"
SET "onboardingCompletedAt" = "createdAt"
WHERE "onboardingCompletedAt" IS NULL;
