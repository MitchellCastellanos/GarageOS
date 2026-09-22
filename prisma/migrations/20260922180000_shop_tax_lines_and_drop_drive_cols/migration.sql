-- Contabilidad universal: los impuestos ya no están hardcodeados a Quebec
-- (TPS 5% + TVQ 9.975%) y el envío de documentos a Google Drive + email a
-- "la contadora" deja de existir (usaba variables de entorno GLOBALES
-- compartidas por todos los talleres del SaaS — nunca fue multi-tenant).
--
-- Shop.taxLines: impuestos configurables por taller (nombre + tasa cada uno).
-- El default preserva el comportamiento actual de los talleres existentes
-- (GST 5% + QST 9.975%, el default de Quebec de antes).
ALTER TABLE "garageos"."Shop"
  ADD COLUMN "taxLines" JSONB NOT NULL DEFAULT '[{"name":"GST","rate":"0.05"},{"name":"QST","rate":"0.09975"}]';

-- driveFileId/driveFolderId ya no se usan: los documentos de contabilidad
-- viven solo en Supabase Storage (aislado por shopId), no en una carpeta de
-- Drive compartida entre talleres.
ALTER TABLE "garageos"."AccountingDocument"
  DROP COLUMN "driveFileId",
  DROP COLUMN "driveFolderId";
