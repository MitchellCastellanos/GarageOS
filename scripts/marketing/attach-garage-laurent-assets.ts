// Integra las imágenes de «Garage Laurent» en el taller creado por el seed (marketing-garage-laurent-v1).
//
//   npm run attach:marketing-garage-laurent-assets -- --dry-run     # valida, convierte y compara; no sube ni escribe
//   npm run attach:marketing-garage-laurent-assets                  # sube y asocia (requiere Storage configurado)
//
// Usa los helpers reales de storage (uploadShopLogoToStorage, uploadBookingPageImageToStorage,
// uploadPrivateDocument) y la misma ruta de carpeta de reservas. Idempotente por contenido: compara el SHA-256
// del archivo con lo que ya hay en Storage y no vuelve a subir ni duplica InspectionPhoto.
// Nunca cambia la factura ni los documentos fiscales; el logo llega a los renders por Shop.logoUrl.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { db } from "@/lib/db";
import {
  isStorageConfigured,
  uploadShopLogoToStorage,
  uploadBookingPageImageToStorage,
  uploadPrivateDocument,
  downloadPrivateDocument,
} from "@/lib/storage";
import { validateLogo } from "@/lib/logo-upload";
import { bookingImageStorageFolder, BOOKING_IMAGE_MAX_WIDTH } from "@/lib/booking-page";
import { isAllowedPhotoType } from "@/lib/upload-policy";

const SHOP_ID = "mkt-gl-v1-shop";
const SHOP_SLUG = "garage-laurent-demo";
const OWNER_EMAIL = "demo.garage.laurent@example.com";
const CAMILLE_TIRES_ITEM = "mkt-gl-v1-ii-camille-tires";
const CAMILLE_BRAKES_ITEM = "mkt-gl-v1-ii-camille-brakes";
const CAMILLE_INSPECTION = "mkt-gl-v1-insp-camille";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const assetsDir = path.join(root, "Garage Laurent");
const dryRun = process.argv.includes("--dry-run");

/** Solo las dos variables de Storage; nunca DATABASE_URL (la base del seed queda como está). No sobrescribe valores ya definidos. */
function loadStorageEnv(): void {
  const file = path.join(root, process.env.GARAGEOS_STORAGE_ENV_FILE ?? ".env.production.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=(.*)$/.exec(line.trim());
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const log = (m: string) => process.stdout.write(`${m}\n`);
function fail(m: string): never {
  process.stderr.write(`\n[assets] DETENIDO — no se modificó nada.\n${m}\n`);
  process.exit(1);
}

/** Localiza cada archivo por palabras clave; ambigüedad = error explícito. */
function resolveFiles(): Record<"logo" | "exterior" | "workshop" | "tires" | "brakes" | "campaign", string> {
  if (!existsSync(assetsDir)) fail(`No encuentro la carpeta «Garage Laurent» en la raíz del proyecto (${assetsDir}).`);
  const names = readdirSync(assetsDir).filter((n) => /\.(png|jpe?g|webp)$/i.test(n));
  const pick = (label: string, re: RegExp): string => {
    const hits = names.filter((n) => re.test(n));
    if (hits.length !== 1) fail(`«${label}»: se esperaba 1 archivo y se encontraron ${hits.length} (${hits.join(", ") || "ninguno"}).`);
    return path.join(assetsDir, hits[0]);
  };
  return {
    logo: pick("logo mecánico", /mechanical logo/i),
    exterior: pick("exterior", /exterior/i),
    workshop: pick("taller interior", /workshop/i),
    tires: pick("neumáticos (hallazgo Pneus)", /worn tire/i),
    brakes: pick("frenos (hallazgo Freins avant)", /brake/i),
    campaign: pick("campaña (Autumn)", /autumn/i),
  };
}

async function assertLogoHasTransparency(file: string): Promise<void> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparent++;
  if (transparent / (info.width * info.height) < 0.05) fail("El logo no tiene fondo transparente: usa la versión transparente.");
}

async function toWebp(file: string, maxWidth: number): Promise<Buffer> {
  return sharp(file).rotate().resize({ width: maxWidth, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

async function main() {
  loadStorageEnv();
  const files = resolveFiles();
  log("[assets] Archivos encontrados:");
  for (const [k, v] of Object.entries(files)) log(`  ${k.padEnd(9)} ← ${path.basename(v)}`);

  // Identidad del taller antes de tocar nada.
  const shop = await db.shop.findUnique({ where: { id: SHOP_ID } });
  if (!shop || shop.slug !== SHOP_SLUG) fail("No encuentro el taller del seed (id mkt-gl-v1-shop con slug garage-laurent-demo).");
  const owner = await db.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!owner || owner.shopId !== SHOP_ID || owner.role !== "OWNER") fail("El OWNER del seed no está ligado a este taller.");
  const items = await db.inspectionItem.findMany({ where: { id: { in: [CAMILLE_TIRES_ITEM, CAMILLE_BRAKES_ITEM] }, inspectionId: CAMILLE_INSPECTION, inspection: { shopId: SHOP_ID } }, select: { id: true, inspectionId: true, category: true } });
  if (items.length !== 2) fail("No encuentro los dos hallazgos de la inspección de Camille.");

  await assertLogoHasTransparency(files.logo);
  const logoBuf = readFileSync(files.logo);
  const logoCheck = validateLogo({ size: logoBuf.length, type: "image/png" });
  if (logoCheck) fail(`Logo rechazado por la validación del producto: ${logoCheck}.`);
  const coverWebp = await toWebp(files.exterior, BOOKING_IMAGE_MAX_WIDTH.cover);
  const shopWebp = await toWebp(files.workshop, BOOKING_IMAGE_MAX_WIDTH.shop);
  const tiresBuf = readFileSync(files.tires);
  const brakesBuf = readFileSync(files.brakes);
  for (const [label, b] of [["neumáticos", tiresBuf], ["frenos", brakesBuf]] as const) {
    if (b.length > MAX_PHOTO_BYTES) fail(`La foto de ${label} supera 8 MB.`);
    if (!isAllowedPhotoType("image/png")) fail("image/png no está permitido para fotos DVI.");
  }

  log(`[assets] Plan: logo ${sha(logoBuf).slice(0, 12)} · portada ${sha(coverWebp).slice(0, 12)} · taller ${sha(shopWebp).slice(0, 12)} · Pneus ${sha(tiresBuf).slice(0, 12)} · Freins ${sha(brakesBuf).slice(0, 12)}`);
  log(`[assets] Campaña: «${path.basename(files.campaign)}» queda como activo pendiente (la campaña es solo texto).`);
  if (dryRun) {
    log("[assets] Dry-run completado. No se subió ni se escribió nada.");
    return;
  }
  if (!isStorageConfigured()) {
    fail("Falta Storage: define NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del entorno donde vive el taller (no se usan secretos de producción).");
  }

  // Logo: Shop.logoUrl (bucket público, ruta logos/{shopId}/logo.png).
  const currentLogo = shop.logoUrl ? await fetchBytes(shop.logoUrl) : null;
  if (currentLogo && sha(currentLogo) === sha(logoBuf)) log("[assets] Logo: ya asociado (mismo contenido).");
  else {
    const { publicUrl } = await uploadShopLogoToStorage(SHOP_ID, logoBuf, "image/png", "png");
    await db.shop.update({ where: { id: SHOP_ID }, data: { logoUrl: publicUrl } });
    log("[assets] Logo: subido y asociado a Shop.logoUrl.");
  }

  // Booking: portada y foto del taller (WebP, mismo límite de ancho que el configurador).
  for (const [kind, field, buf, current] of [
    ["cover", "bookingCoverImageUrl", coverWebp, shop.bookingCoverImageUrl],
    ["shop", "bookingShopImageUrl", shopWebp, shop.bookingShopImageUrl],
  ] as const) {
    const existing = current ? await fetchBytes(current) : null;
    if (existing && sha(existing) === sha(buf)) {
      log(`[assets] Booking ${kind}: ya asociada (mismo contenido).`);
      continue;
    }
    const { publicUrl } = await uploadBookingPageImageToStorage(bookingImageStorageFolder(SHOP_ID), kind, buf);
    await db.shop.update({ where: { id: SHOP_ID }, data: { [field]: publicUrl } });
    log(`[assets] Booking ${kind}: subida y asociada a Shop.${field}.`);
  }

  // Inspección de Camille: InspectionPhoto → InspectionItem, en almacenamiento privado.
  const photoFor = [
    { itemId: CAMILLE_TIRES_ITEM, buf: tiresBuf, name: path.basename(files.tires), label: "Pneus" },
    { itemId: CAMILLE_BRAKES_ITEM, buf: brakesBuf, name: path.basename(files.brakes), label: "Freins avant" },
  ];
  for (const p of photoFor) {
    const item = items.find((i) => i.id === p.itemId)!;
    const existing = await db.inspectionPhoto.findMany({ where: { inspectionItemId: item.id }, select: { storagePath: true } });
    let already = false;
    for (const ph of existing) {
      const bytes = await downloadPrivateDocument(SHOP_ID, ph.storagePath).catch(() => null);
      if (bytes && sha(bytes) === sha(p.buf)) already = true;
    }
    if (already) {
      log(`[assets] Hallazgo ${p.label}: foto ya asociada (mismo contenido).`);
      continue;
    }
    const { storagePath } = await uploadPrivateDocument(SHOP_ID, `inspections/${item.inspectionId}`, p.name, p.buf, "image/png");
    await db.inspectionPhoto.create({ data: { inspectionItemId: item.id, storagePath } });
    log(`[assets] Hallazgo ${p.label}: foto subida y asociada (InspectionPhoto).`);
  }
}

main()
  .catch((err) => {
    process.stderr.write(`[assets] Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
