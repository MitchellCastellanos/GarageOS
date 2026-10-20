-- Super Admin switch (default off): allow a confirmed call outside the recipient's local calling hours. Additive.
ALTER TABLE "garageos"."CrmVoiceSettings" ADD COLUMN "allowOutOfHoursCalls" BOOLEAN NOT NULL DEFAULT false;
