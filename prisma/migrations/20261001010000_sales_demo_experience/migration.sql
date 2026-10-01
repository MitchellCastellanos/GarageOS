ALTER TABLE "garageos"."SalesDemo" ADD COLUMN "communicationsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "garageos"."SalesDemo" ADD COLUMN "scenarioBatchId" TEXT;
CREATE UNIQUE INDEX "SalesDemo_scenarioBatchId_key" ON "garageos"."SalesDemo"("scenarioBatchId");
ALTER TABLE "garageos"."CommunicationMessage" ADD COLUMN "salesDemoOriginId" TEXT;
ALTER TABLE "garageos"."CommunicationMessage" ADD COLUMN "sendAttemptedAt" TIMESTAMP(3);
ALTER TABLE "garageos"."Client" ADD COLUMN "demoSeedBatchId" TEXT;
ALTER TABLE "garageos"."Vehicle" ADD COLUMN "demoSeedBatchId" TEXT;
ALTER TABLE "garageos"."Appointment" ADD COLUMN "demoSeedBatchId" TEXT;
ALTER TABLE "garageos"."Quote" ADD COLUMN "demoSeedBatchId" TEXT;
ALTER TABLE "garageos"."WorkOrder" ADD COLUMN "demoSeedBatchId" TEXT;
ALTER TABLE "garageos"."Invoice" ADD COLUMN "demoSeedBatchId" TEXT;
-- Conservatively preserve any historical demo activity. No provider/billing effects.
UPDATE "garageos"."CommunicationMessage" m SET "salesDemoOriginId" = d.id, "billedOverageSegments" = CASE WHEN m.channel = 'SMS' THEN 0 ELSE m."billedOverageSegments" END
FROM "garageos"."SalesDemo" d WHERE m."shopId" = d."shopId" AND (d."convertedAt" IS NULL OR m."createdAt" <= d."convertedAt");
-- Enforce monotonic provenance at the database boundary, including raw/background updates.
CREATE FUNCTION "garageos".preserve_demo_communication_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."salesDemoOriginId" IS NOT NULL THEN
    NEW."salesDemoOriginId" := OLD."salesDemoOriginId";
  END IF;
  IF NEW."salesDemoOriginId" IS NULL THEN
    SELECT id INTO NEW."salesDemoOriginId" FROM "garageos"."SalesDemo"
    WHERE "shopId" = NEW."shopId" AND (status <> 'CONVERTED' OR NEW."createdAt" <= "convertedAt");
  END IF;
  IF NEW."salesDemoOriginId" IS NOT NULL AND NEW.channel = 'SMS' THEN
    NEW."billedOverageSegments" := 0;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_demo_communication_origin BEFORE INSERT OR UPDATE ON "garageos"."CommunicationMessage"
FOR EACH ROW EXECUTE FUNCTION "garageos".preserve_demo_communication_origin();
