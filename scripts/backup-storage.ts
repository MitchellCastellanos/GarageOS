// Copia de seguridad de solo lectura de los buckets de Supabase Storage (los backups de BD NO incluyen archivos).
//   npx tsx scripts/backup-storage.ts <directorio-salida>
// Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. No modifica ni borra nada en Supabase.
// Guardar el resultado CIFRADO fuera de la plataforma; contiene documentos de clientes.
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const BUCKETS = ["public-assets", "accounting", "communications"];
const out = process.argv[2];
if (!out) throw new Error("usage: tsx scripts/backup-storage.ts <output-dir>");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase env vars not set");
const sb = createClient(url, key);

const PAGE = 1000;
async function listAll(bucket: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  // Paginate: a single list() call returns at most PAGE entries, so a larger prefix would be silently truncated.
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const e of data ?? []) {
      const p = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) files.push(...(await listAll(bucket, p)));
      else files.push(p);
    }
    if ((data?.length ?? 0) < PAGE) break;
  }
  return files;
}

async function main() {
  const { data: existing } = await sb.storage.listBuckets();
  let ok = 0, failed = 0;
  const manifest: { bucket: string; path: string; bytes: number; sha256: string }[] = [];
  for (const bucket of BUCKETS) {
    if (!existing?.some((b) => b.name === bucket)) continue;
    for (const path of await listAll(bucket)) {
      const { data, error } = await sb.storage.from(bucket).download(path);
      if (error || !data) { failed++; console.error(`FAILED ${bucket}/${path}`); continue; }
      const dest = join(out, bucket, path);
      await mkdir(dirname(dest), { recursive: true });
      const bytes = Buffer.from(await data.arrayBuffer());
      await writeFile(dest, bytes);
      manifest.push({ bucket, path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      ok++;
    }
  }
  // The manifest lets a restore drill verify object count and byte-identity (paths are the keys stored in the DB).
  await writeFile(join(out, "manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), files: manifest }, null, 1));
  console.log(`storage backup: ${ok} files, ${failed} failed`);
  if (failed) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
