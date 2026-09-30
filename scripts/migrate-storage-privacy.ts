// Migración idempotente / reanudable: separa assets públicos de documentos privados.
//
//   npx tsx scripts/migrate-storage-privacy.ts              # DRY-RUN (por defecto, no escribe nada)
//   npx tsx scripts/migrate-storage-privacy.ts --apply      # copia assets públicos + reescribe BD
//   npx tsx scripts/migrate-storage-privacy.ts --apply --finalize   # además hace PRIVADO el bucket `accounting`
//   npx tsx scripts/migrate-storage-privacy.ts --apply --delete-public-copies
//        # borra de `accounting` SOLO los logos/fotos ya verificados en `public-assets` (más adelante)
//
// Requiere DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (Production).
// Nunca borra un objeto por no poder resolver su referencia en la BD. En dry-run, las copias que
// --apply haría se cuentan como "planned", no como "unresolved" (que son problemas reales).
// La lógica vive en src/lib/storage-migration.ts (probada con un Supabase/BD falsos).

import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { runStoragePrivacyMigration, type MigrationDb } from "@/lib/storage-migration";

const args = new Set(process.argv.slice(2));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");

const apply = args.has("--apply");
console.log(`${apply ? "[apply]" : "[dry-run]"} storage privacy migration`);

runStoragePrivacyMigration(createClient(url, key), db as unknown as MigrationDb, {
  apply,
  finalize: args.has("--finalize"),
  deletePublicCopies: args.has("--delete-public-copies"),
  log: (m) => console.log(m),
  warn: (m) => console.warn(m),
})
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
