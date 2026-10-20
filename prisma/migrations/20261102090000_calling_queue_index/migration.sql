-- Calling workspace queue: per-seller, per-province lookups of callable prospects (additive index only).
CREATE INDEX IF NOT EXISTS "CrmProspect_assignedStaffId_phoneEligibility_province_idx" ON "garageos"."CrmProspect"("assignedStaffId", "phoneEligibility", "province");
