// Migración idempotente / reanudable: separa assets públicos de documentos privados.
//
//   npx tsx scripts/migrate-storage-privacy.ts              # DRY-RUN (por defecto, no escribe nada)
//   npx tsx scripts/migrate-storage-privacy.ts --apply      # copia assets públicos + reescribe BD
//   npx tsx scripts/migrate-storage-privacy.ts --finalize   # (con --apply) hace PRIVADO el bucket `accounting`
//   npx tsx scripts/migrate-storage-privacy.ts --apply --delete-public-copies
//        # borra del bucket `accounting` SOLO los logos/fotos ya verificados en `public-assets`
//
// Requiere DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (Production).
// Nunca borra un objeto por no poder resolver su referencia en la BD.
//
// Qué hace:
//  1. Logos / fotos de reservas (Shop.logoUrl, bookingCoverImageUrl, bookingShopImageUrl) que
//     apuntan a `accounting`: copia a `public-assets` (mismo path), VERIFICA tamaño, y solo
//     entonces reescribe la URL en la BD.
//  2. Invoice.pdfUrl con URL pública heredada -> se convierte a storagePath privado.
//  3. Documentos privados (facturas, comprobantes, contables, DVI): mismo path y mismo bucket;
//     solo cambia la visibilidad del bucket (paso --finalize). Se reporta cualquier path
//     referenciado en la BD que no exista en el bucket (no se toca).
//  4. --finalize se niega si queda alguna URL pública a `accounting` en la BD o algún asset
//     público sin copia verificada.

import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { isPublicAssetPath, parseSupabasePublicUrl, rewriteLegacyPublicAssetUrl } from "@/lib/storage-paths";

const SRC = "accounting";
const DST = "public-assets";
const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const FINALIZE = args.has("--finalize");
const DELETE_COPIES = args.has("--delete-public-copies");
const tag = APPLY ? "[apply]" : "[dry-run]";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
const sb = createClient(url, key);

async function listAll(bucket: string, prefix = ""): Promise<{ path: string; size: number }[]> {
  const out: { path: string; size: number }[] = [];
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
  for (const e of data ?? []) {
    const p = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.id === null) out.push(...(await listAll(bucket, p)));
    else out.push({ path: p, size: Number((e.metadata as { size?: number } | null)?.size ?? -1) });
  }
  return out;
}

async function ensureDst() {
  const { data } = await sb.storage.listBuckets();
  const b = data?.find((x) => x.name === DST);
  if (b && !b.public) throw new Error(`${DST} exists but is private; fix before continuing`);
  if (!b && APPLY) {
    const { error } = await sb.storage.createBucket(DST, {
      public: true, fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
    });
    if (error) throw new Error(error.message);
  }
}

/** Copia src->dst si hace falta y devuelve true solo si el destino existe con el mismo tamaño. */
async function copyVerified(path: string, srcSizes: Map<string, number>, dstSizes: Map<string, number>): Promise<boolean> {
  const srcSize = srcSizes.get(path);
  if (srcSize === undefined) { console.warn(`  ! source missing, leaving DB untouched: ${path}`); return false; }
  if (dstSizes.get(path) === srcSize) return true; // ya copiado (idempotente)
  if (!APPLY) { console.log(`  ${tag} would copy ${path} (${srcSize} B)`); return false; }
  const { data, error } = await sb.storage.from(SRC).download(path);
  if (error || !data) { console.warn(`  ! download failed ${path}: ${error?.message}`); return false; }
  const buf = Buffer.from(await data.arrayBuffer());
  const { error: upErr } = await sb.storage.from(DST).upload(path, buf, { contentType: data.type || undefined, upsert: true });
  if (upErr) { console.warn(`  ! upload failed ${path}: ${upErr.message}`); return false; }
  const { data: check, error: chkErr } = await sb.storage.from(DST).download(path);
  if (chkErr || !check || (await check.arrayBuffer()).byteLength !== buf.length) {
    console.warn(`  ! verification failed ${path}`); return false;
  }
  dstSizes.set(path, buf.length);
  console.log(`  copied+verified ${path}`);
  return true;
}

async function main() {
  console.log(`${tag} storage privacy migration`);
  await ensureDst();
  const srcObjects = await listAll(SRC);
  const dstObjects = (await sb.storage.listBuckets()).data?.some((b) => b.name === DST) ? await listAll(DST) : [];
  const srcSizes = new Map(srcObjects.map((o) => [o.path, o.size]));
  const dstSizes = new Map(dstObjects.map((o) => [o.path, o.size]));

  const publicObjs = srcObjects.filter((o) => isPublicAssetPath(o.path));
  console.log(`objects in ${SRC}: ${srcObjects.length} (public assets: ${publicObjs.length}, private: ${srcObjects.length - publicObjs.length})`);

  // 1. Assets públicos referenciados por Shop
  const shops = await db.shop.findMany({ select: { id: true, logoUrl: true, bookingCoverImageUrl: true, bookingShopImageUrl: true } });
  const fields = ["logoUrl", "bookingCoverImageUrl", "bookingShopImageUrl"] as const;
  let rewritten = 0, pending = 0;
  for (const shop of shops) {
    for (const f of fields) {
      const rw = rewriteLegacyPublicAssetUrl(shop[f]);
      if (!rw) continue;
      // El path debe pertenecer al propio taller (logos/{shopId}/… o booking-page/{shopId}/…)
      if (!rw.path.split("/")[1]?.startsWith(shop.id)) { console.warn(`  ! ${shop.id}.${f} points to another shop's path; skipped`); pending++; continue; }
      if (await copyVerified(rw.path, srcSizes, dstSizes)) {
        if (APPLY) await db.shop.update({ where: { id: shop.id }, data: { [f]: rw.to } });
        console.log(`  ${tag} ${shop.id}.${f} -> ${DST}`);
        rewritten++;
      } else pending++;
    }
  }

  // 2. Invoice.pdfUrl heredado (URL pública) -> storagePath privado
  const invoices = await db.invoice.findMany({ where: { pdfUrl: { contains: "/storage/v1/object/public/" } }, select: { id: true, shopId: true, pdfUrl: true } });
  for (const inv of invoices) {
    const p = parseSupabasePublicUrl(inv.pdfUrl);
    if (p?.bucket === SRC && p.path.startsWith(`${inv.shopId}/`)) {
      if (APPLY) await db.invoice.update({ where: { id: inv.id }, data: { pdfUrl: p.path } });
      console.log(`  ${tag} invoice ${inv.id}.pdfUrl -> private path`);
    } else { console.warn(`  ! invoice ${inv.id}.pdfUrl unrecognised; left untouched`); pending++; }
  }

  // 3. Referencias privadas en BD que no existen en el bucket (solo reporte)
  const refs: string[] = [];
  refs.push(...(await db.accountingDocument.findMany({ select: { storagePath: true } })).map((r) => r.storagePath));
  refs.push(...(await db.inspectionPhoto.findMany({ select: { storagePath: true } })).map((r) => r.storagePath));
  refs.push(...(await db.invoicePaymentEntry.findMany({ where: { receiptPath: { not: null } }, select: { receiptPath: true } })).map((r) => r.receiptPath!));
  refs.push(...(await db.invoice.findMany({ where: { clientPackagePath: { not: null } }, select: { clientPackagePath: true } })).map((r) => r.clientPackagePath!));
  const missing = refs.filter((r) => !srcSizes.has(r));
  console.log(`private refs in DB: ${refs.length}; missing in bucket: ${missing.length}`);
  missing.forEach((m) => console.warn(`  ! referenced but missing (not touched): ${m}`));
  const referenced = new Set(refs);
  const orphans = srcObjects.filter((o) => !isPublicAssetPath(o.path) && !referenced.has(o.path));
  console.log(`private objects not referenced by the checked columns (kept, review manually): ${orphans.length}`);
  orphans.forEach((o) => console.log(`  ? ${o.path}`));

  // 4. Estado final
  const stillPublic = await db.shop.count({
    where: { OR: fields.map((f) => ({ [f]: { contains: "/object/public/accounting/" } })) },
  });
  console.log(`DB rows still pointing at public ${SRC}: ${stillPublic}; unresolved: ${pending}`);

  if (DELETE_COPIES) {
    if (!APPLY || stillPublic > 0) throw new Error("--delete-public-copies needs --apply and zero remaining public refs");
    const del = publicObjs.filter((o) => dstSizes.get(o.path) === o.size).map((o) => o.path);
    if (del.length) { const { error } = await sb.storage.from(SRC).remove(del); if (error) throw new Error(error.message); }
    console.log(`removed ${del.length} verified public copies from ${SRC}`);
  }

  if (FINALIZE) {
    if (!APPLY) { console.log(`${tag} would make bucket ${SRC} PRIVATE (only if no public refs/unresolved)`); return; }
    const unmigrated = publicObjs.filter((o) => dstSizes.get(o.path) !== o.size && !DELETE_COPIES);
    if (stillPublic > 0 || pending > 0 || unmigrated.length > 0) {
      throw new Error(`refusing to finalize: stillPublic=${stillPublic} pending=${pending} uncopied=${unmigrated.length}`);
    }
    const { error } = await sb.storage.updateBucket(SRC, { public: false });
    if (error) throw new Error(error.message);
    console.log(`bucket ${SRC} is now PRIVATE`);
  }
  console.log(`done. rewritten=${rewritten}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
