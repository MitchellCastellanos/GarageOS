// Copia de seguridad de solo lectura de los buckets de Supabase Storage (los backups de BD NO incluyen archivos).
//   npx tsx scripts/backup-storage.ts <directorio-salida>
// Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. No modifica ni borra nada en Supabase.
// Guardar el resultado CIFRADO fuera de la plataforma; contiene documentos de clientes.
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const BUCKETS = ["public-assets", "accounting", "communications"];
const out = process.argv[2];
if (!out) throw new Error("usage: tsx scripts/backup-storage.ts <output-dir>");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase env vars not set");
const sb = createClient(url, key);

async function listAll(bucket: string, prefix = ""): Promise<string[]> {
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
  const files: string[] = [];
  for (const e of data ?? []) {
    const p = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.id === null) files.push(...(await listAll(bucket, p)));
    else files.push(p);
  }
  return files;
}

async function main() {
  const { data: existing } = await sb.storage.listBuckets();
  let ok = 0, failed = 0;
  for (const bucket of BUCKETS) {
    if (!existing?.some((b) => b.name === bucket)) continue;
    for (const path of await listAll(bucket)) {
      const { data, error } = await sb.storage.from(bucket).download(path);
      if (error || !data) { failed++; console.error(`FAILED ${bucket}/${path}`); continue; }
      const dest = join(out, bucket, path);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, Buffer.from(await data.arrayBuffer()));
      ok++;
    }
  }
  console.log(`storage backup: ${ok} files, ${failed} failed`);
  if (failed) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
