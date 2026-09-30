// Núcleo de scripts/migrate-storage-privacy.ts, con dependencias inyectadas para poder probarlo
// de punta a punta con un Supabase/BD falsos (tests/storage-migration.test.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPublicAssetPath, parseSupabasePublicUrl, rewriteLegacyPublicAssetUrl } from "@/lib/storage-paths";

export const SRC_BUCKET = "accounting";
export const DST_BUCKET = "public-assets";

export type ShopUrlField = "logoUrl" | "bookingCoverImageUrl" | "bookingShopImageUrl";
export const SHOP_URL_FIELDS: ShopUrlField[] = ["logoUrl", "bookingCoverImageUrl", "bookingShopImageUrl"];

type ShopRow = { id: string } & Record<ShopUrlField, string | null>;

/** Subconjunto de Prisma que usa la migración. */
export interface MigrationDb {
  shop: {
    findMany(args: { select: Record<string, true> }): Promise<ShopRow[]>;
    update(args: { where: { id: string }; data: Partial<Record<ShopUrlField, string>> }): Promise<unknown>;
    count(args: { where: { OR: Record<string, { contains: string }>[] } }): Promise<number>;
  };
  invoice: {
    findMany(args: Record<string, unknown>): Promise<{ id: string; shopId: string; pdfUrl?: string | null; clientPackagePath?: string | null }[]>;
    update(args: { where: { id: string }; data: { pdfUrl: string } }): Promise<unknown>;
  };
  accountingDocument: { findMany(args: Record<string, unknown>): Promise<{ storagePath: string }[]> };
  inspectionPhoto: { findMany(args: Record<string, unknown>): Promise<{ storagePath: string }[]> };
  invoicePaymentEntry: { findMany(args: Record<string, unknown>): Promise<{ receiptPath: string | null }[]> };
}

/** Qué hay que hacer con UNA referencia (URL) de un taller. Puro. */
export type ReferenceAction =
  | { action: "skip" } // no es una URL pública heredada de `accounting`
  | { action: "ownership-mismatch"; path: string }
  | { action: "source-missing"; path: string }
  | { action: "copy"; path: string; to: string } // hay que copiar y luego reescribir
  | { action: "rewrite"; path: string; to: string }; // el destino ya existe verificado: solo reescribir

export function classifyLegacyReference(
  shopId: string,
  url: unknown,
  srcSizes: Map<string, number>,
  dstSizes: Map<string, number>
): ReferenceAction {
  const rw = rewriteLegacyPublicAssetUrl(url);
  if (!rw) return { action: "skip" };
  // logos/{shopId}/… y booking-page/{shopId}/…: el segundo segmento debe ser EXACTAMENTE este taller.
  if (rw.path.split("/")[1] !== shopId) return { action: "ownership-mismatch", path: rw.path };
  const srcSize = srcSizes.get(rw.path);
  if (srcSize === undefined) return { action: "source-missing", path: rw.path };
  if (dstSizes.get(rw.path) === srcSize) return { action: "rewrite", path: rw.path, to: rw.to };
  return { action: "copy", path: rw.path, to: rw.to };
}

export interface MigrationOptions {
  apply: boolean;
  finalize: boolean;
  deletePublicCopies: boolean;
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
}

export interface MigrationResult {
  publicObjects: number;
  privateObjects: number;
  /** Copias/reescrituras que --apply realizaría (solo tiene sentido en dry-run). */
  planned: number;
  /** Problemas reales: origen ausente, taller ajeno, fallo de descarga/subida/verificación, URL no reconocida. */
  unresolved: number;
  rewritten: number;
  stillPublicRefs: number;
  missingPrivateRefs: number;
  bucketMadePrivate: boolean;
  removedCopies: number;
}

export async function listAllObjects(sb: SupabaseClient, bucket: string, prefix = ""): Promise<{ path: string; size: number }[]> {
  const out: { path: string; size: number }[] = [];
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
  for (const e of data ?? []) {
    const p = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.id === null) out.push(...(await listAllObjects(sb, bucket, p)));
    else out.push({ path: p, size: Number((e.metadata as { size?: number } | null)?.size ?? -1) });
  }
  return out;
}

export async function runStoragePrivacyMigration(sb: SupabaseClient, db: MigrationDb, opts: MigrationOptions): Promise<MigrationResult> {
  const log = opts.log ?? (() => {});
  const warn = opts.warn ?? (() => {});
  const tag = opts.apply ? "[apply]" : "[dry-run]";
  const res: MigrationResult = {
    publicObjects: 0, privateObjects: 0, planned: 0, unresolved: 0, rewritten: 0,
    stillPublicRefs: 0, missingPrivateRefs: 0, bucketMadePrivate: false, removedCopies: 0,
  };

  // Bucket destino
  let { data: buckets } = await sb.storage.listBuckets();
  const dst = buckets?.find((b) => b.name === DST_BUCKET);
  if (dst && !dst.public) throw new Error(`${DST_BUCKET} exists but is private; fix before continuing`);
  if (!dst && opts.apply) {
    const { error } = await sb.storage.createBucket(DST_BUCKET, {
      public: true, fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
    });
    if (error) throw new Error(error.message);
    buckets = (await sb.storage.listBuckets()).data ?? buckets;
  }

  const srcObjects = await listAllObjects(sb, SRC_BUCKET);
  const dstExists = buckets?.some((b) => b.name === DST_BUCKET) || opts.apply;
  const dstObjects = dstExists ? await listAllObjects(sb, DST_BUCKET) : [];
  const srcSizes = new Map(srcObjects.map((o) => [o.path, o.size]));
  const dstSizes = new Map(dstObjects.map((o) => [o.path, o.size]));
  const publicObjs = srcObjects.filter((o) => isPublicAssetPath(o.path));
  res.publicObjects = publicObjs.length;
  res.privateObjects = srcObjects.length - publicObjs.length;
  log(`objects in ${SRC_BUCKET}: ${srcObjects.length} (public assets: ${res.publicObjects}, private: ${res.privateObjects})`);

  async function copyVerified(path: string): Promise<boolean> {
    const { data, error } = await sb.storage.from(SRC_BUCKET).download(path);
    if (error || !data) { warn(`  ! download failed ${path}: ${error?.message}`); return false; }
    const buf = Buffer.from(await data.arrayBuffer());
    const { error: upErr } = await sb.storage.from(DST_BUCKET).upload(path, buf, { contentType: data.type || undefined, upsert: true });
    if (upErr) { warn(`  ! upload failed ${path}: ${upErr.message}`); return false; }
    const { data: check, error: chkErr } = await sb.storage.from(DST_BUCKET).download(path);
    if (chkErr || !check || (await check.arrayBuffer()).byteLength !== buf.length) { warn(`  ! verification failed ${path}`); return false; }
    dstSizes.set(path, buf.length);
    log(`  copied+verified ${path}`);
    return true;
  }

  // 1. Assets públicos referenciados por Shop
  const shops = await db.shop.findMany({ select: { id: true, logoUrl: true, bookingCoverImageUrl: true, bookingShopImageUrl: true } });
  for (const shop of shops) {
    for (const f of SHOP_URL_FIELDS) {
      const value = shop[f];
      const step = classifyLegacyReference(shop.id, value, srcSizes, dstSizes);
      if (step.action === "skip") continue;
      if (step.action === "ownership-mismatch") { warn(`  ! ${shop.id}.${f} points to another shop's path (${step.path}); skipped`); res.unresolved++; continue; }
      if (step.action === "source-missing") { warn(`  ! source missing, leaving DB untouched: ${step.path}`); res.unresolved++; continue; }
      if (step.action === "copy") {
        if (!opts.apply) { log(`  ${tag} would copy ${step.path} (${srcSizes.get(step.path)} B) and rewrite ${shop.id}.${f}`); res.planned++; continue; }
        if (!(await copyVerified(step.path))) { res.unresolved++; continue; }
      } else if (!opts.apply) { log(`  ${tag} would rewrite ${shop.id}.${f} (copy already verified)`); res.planned++; continue; }
      await db.shop.update({ where: { id: shop.id }, data: { [f]: step.to } });
      log(`  ${tag} ${shop.id}.${f} -> ${DST_BUCKET}`);
      res.rewritten++;
    }
  }

  // 2. Invoice.pdfUrl heredado (URL pública) -> storagePath privado
  const invoices = await db.invoice.findMany({ where: { pdfUrl: { contains: "/storage/v1/object/public/" } }, select: { id: true, shopId: true, pdfUrl: true } });
  for (const inv of invoices) {
    const p = parseSupabasePublicUrl(inv.pdfUrl);
    if (p?.bucket === SRC_BUCKET && p.path.startsWith(`${inv.shopId}/`)) {
      if (!opts.apply) { log(`  ${tag} would convert invoice ${inv.id}.pdfUrl to a private path`); res.planned++; continue; }
      await db.invoice.update({ where: { id: inv.id }, data: { pdfUrl: p.path } });
      log(`  ${tag} invoice ${inv.id}.pdfUrl -> private path`);
    } else { warn(`  ! invoice ${inv.id}.pdfUrl unrecognised; left untouched`); res.unresolved++; }
  }

  // 3. Referencias privadas en BD que no existen en el bucket (solo reporte)
  const refs: string[] = [];
  refs.push(...(await db.accountingDocument.findMany({ select: { storagePath: true } })).map((r) => r.storagePath));
  refs.push(...(await db.inspectionPhoto.findMany({ select: { storagePath: true } })).map((r) => r.storagePath));
  refs.push(...(await db.invoicePaymentEntry.findMany({ where: { receiptPath: { not: null } }, select: { receiptPath: true } })).map((r) => r.receiptPath!));
  refs.push(...(await db.invoice.findMany({ where: { clientPackagePath: { not: null } }, select: { id: true, shopId: true, clientPackagePath: true } })).map((r) => r.clientPackagePath!));
  const missing = refs.filter((r) => !srcSizes.has(r));
  res.missingPrivateRefs = missing.length;
  log(`private refs in DB: ${refs.length}; missing in bucket: ${missing.length}`);
  missing.forEach((m) => warn(`  ! referenced but missing (not touched): ${m}`));
  const referenced = new Set(refs);
  const orphans = srcObjects.filter((o) => !isPublicAssetPath(o.path) && !referenced.has(o.path));
  log(`private objects not referenced by the checked columns (kept, review manually): ${orphans.length}`);
  orphans.forEach((o) => log(`  ? ${o.path}`));

  // 4. Estado
  res.stillPublicRefs = await db.shop.count({ where: { OR: SHOP_URL_FIELDS.map((f) => ({ [f]: { contains: `/object/public/${SRC_BUCKET}/` } })) } });
  log(`DB rows still pointing at public ${SRC_BUCKET}: ${res.stillPublicRefs}`);
  log(opts.apply
    ? `unresolved (real problems): ${res.unresolved}`
    : `planned by --apply: ${res.planned}; unresolved (real problems): ${res.unresolved}`);

  if (opts.deletePublicCopies) {
    if (!opts.apply || res.stillPublicRefs > 0) throw new Error("--delete-public-copies needs --apply and zero remaining public refs");
    const del = publicObjs.filter((o) => dstSizes.get(o.path) === o.size).map((o) => o.path);
    if (del.length) { const { error } = await sb.storage.from(SRC_BUCKET).remove(del); if (error) throw new Error(error.message); }
    res.removedCopies = del.length;
    log(`removed ${del.length} verified public copies from ${SRC_BUCKET}`);
  }

  if (opts.finalize) {
    const uncopied = publicObjs.filter((o) => dstSizes.get(o.path) !== o.size && !opts.deletePublicCopies);
    if (!opts.apply) {
      const blockers = res.planned + res.unresolved + res.stillPublicRefs + uncopied.length;
      log(blockers === 0 ? `${tag} bucket ${SRC_BUCKET} could be made PRIVATE now` : `${tag} finalize would be REFUSED until --apply completes (planned=${res.planned}, unresolved=${res.unresolved}, publicRefs=${res.stillPublicRefs}, uncopied=${uncopied.length})`);
    } else {
      if (res.stillPublicRefs > 0 || res.unresolved > 0 || uncopied.length > 0) {
        throw new Error(`refusing to finalize: stillPublic=${res.stillPublicRefs} unresolved=${res.unresolved} uncopied=${uncopied.length}`);
      }
      const { error } = await sb.storage.updateBucket(SRC_BUCKET, { public: false });
      if (error) throw new Error(error.message);
      res.bucketMadePrivate = true;
      log(`bucket ${SRC_BUCKET} is now PRIVATE`);
    }
  }
  log(`done. rewritten=${res.rewritten}`);
  return res;
}
