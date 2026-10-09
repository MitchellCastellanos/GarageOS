-- Sales inbound via Cloudflare Email Routing + Email Worker. Additive; existing settings keep RESEND behaviour.
CREATE TYPE "garageos"."CrmInboundProvider" AS ENUM ('RESEND', 'CLOUDFLARE');
ALTER TABLE "garageos"."CrmCommsSettings"
  ADD COLUMN "inboundProvider" "garageos"."CrmInboundProvider" NOT NULL DEFAULT 'RESEND',
  ADD COLUMN "inboundReplyLocal" TEXT;
ALTER TABLE "garageos"."CrmCommsSettings" ADD CONSTRAINT "CrmCommsSettings_inboundReplyLocal_check" CHECK ("inboundReplyLocal" IS NULL OR "inboundReplyLocal" ~ '^[a-z0-9][a-z0-9._-]{0,40}$');
