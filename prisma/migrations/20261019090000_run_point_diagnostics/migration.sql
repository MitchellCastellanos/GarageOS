-- Lead Radar run diagnostics for source coordinates. Additive only: four counters defaulting to 0, no data change, no backfill.
-- They let the run page and Settings → Geocoding show whether an extraction actually carried positions (and how many were stored on new vs already-staged
-- candidates) instead of a bare "Completed".
ALTER TABLE "garageos"."CrmDiscoveryRun"
  ADD COLUMN "recordsWithPoint" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pointsAccepted" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pointsOnNew" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pointsOnExisting" INTEGER NOT NULL DEFAULT 0;
