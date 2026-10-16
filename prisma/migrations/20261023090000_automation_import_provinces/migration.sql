-- Province scope for the automatic CRM import (additive). Empty array = every province = the exact behaviour before this column existed. No data change.
ALTER TABLE "garageos"."CrmLeadAutomation" ADD COLUMN "importProvinces" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
