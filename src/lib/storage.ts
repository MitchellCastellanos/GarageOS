// Supabase Storage — separación explícita público / privado.
//
//  PÚBLICO  (bucket `public-assets`, URL pública permanente): SOLO logos del taller
//           y fotos de la página pública de reservas. Nada con datos de clientes.
//  PRIVADO  (bucket `accounting`, privado): facturas, comprobantes de pago,
//           documentos contables, fotos DVI. Sin URL pública: se guarda solo el
//           `storagePath` en la BD y se emite acceso (descarga server-side o URL
//           firmada corta) DESPUÉS de autorizar. Toda función privada exige el
//           shopId y rechaza paths que no sean `{shopId}/…`.
//  PRIVADO  (bucket `communications`): adjuntos del Inbox.
//
// El cliente usa SERVICE_ROLE_KEY (bypass de RLS); por eso el aislamiento por
// taller se aplica aquí, en el helper. Ver docs/compliance/ENGINEERING-RULES.md.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assertTenantStoragePath,
  isPublicAssetPath,
  sanitizeStorageFileName,
} from "@/lib/storage-paths";

/** Bucket público — únicamente assets públicos por diseño de producto. */
export const PUBLIC_ASSETS_BUCKET = "public-assets";
/** Bucket privado — documentos contables/clientes (nombre histórico conservado). */
export const PRIVATE_DOCUMENTS_BUCKET = "accounting";
/** Bucket privado — adjuntos de Inbox/email entrante. */
export const COMMUNICATIONS_BUCKET = "communications";

/** TTL por defecto de URLs firmadas (segundos). */
export const DEFAULT_SIGNED_URL_TTL = 3600;
/** TTL corto para redirecciones inmediatas tras autorizar. */
export const SHORT_SIGNED_URL_TTL = 60;

let clientOverride: SupabaseClient | null = null;
/** Solo tests: inyecta un cliente falso (y descarta la caché de visibilidad). */
export function __setStorageClientForTests(client: SupabaseClient | null) {
  clientOverride = client;
  privateVerifiedAt.clear();
}

function getClient(): SupabaseClient {
  if (clientOverride) return clientOverride;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not set");
  return createClient(url, key);
}

/** True si Storage está configurado en este entorno (Preview no tiene service key a propósito). */
export function isStorageConfigured(): boolean {
  return Boolean(clientOverride || (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY));
}

// ── Buckets ───────────────────────────────────────────────────────────────

async function ensureBucket(client: SupabaseClient, name: string, isPublic: boolean) {
  const { data: buckets, error: listError } = await client.storage.listBuckets();
  if (listError) throw new Error(`No se pudo listar buckets de Supabase: ${listError.message}`);
  const existing = buckets?.find((b) => b.name === name);
  if (existing) {
    // Nunca sirvas un bucket con la visibilidad equivocada: falla en vez de subir.
    if (existing.public !== isPublic) {
      throw new Error(
        `El bucket «${name}» debe ser ${isPublic ? "público" : "PRIVADO"} pero está configurado al revés. ` +
          `Ejecuta scripts/migrate-storage-privacy.ts (o corrige la visibilidad en Supabase → Storage).`
      );
    }
    return;
  }
  const { error } = await client.storage.createBucket(name, { public: isPublic });
  if (error) throw new Error(`No se pudo crear el bucket «${name}»: ${error.message}`);
}

// Lecturas privadas: fallan cerrado si el bucket es (o pasa a ser) público.
// Solo se cachea el resultado "verificado privado" (nunca un fallo) por un TTL corto, para no
// llamar a Storage en cada descarga; si alguien lo hace público, la lectura se bloquea en ≤ TTL.
export const PRIVATE_BUCKET_CHECK_TTL_MS = 60_000;
const privateVerifiedAt = new Map<string, number>();

async function assertBucketPrivateForRead(client: SupabaseClient, name: string): Promise<void> {
  const last = privateVerifiedAt.get(name);
  if (last !== undefined && Date.now() - last < PRIVATE_BUCKET_CHECK_TTL_MS) return;
  privateVerifiedAt.delete(name);
  const { data: buckets, error } = await client.storage.listBuckets();
  if (error) throw new Error(`No se pudo verificar la visibilidad del bucket «${name}»: ${error.message}`);
  const bucket = buckets?.find((b) => b.name === name);
  if (!bucket) throw new Error(`El bucket privado «${name}» no existe; se rechaza la lectura.`);
  if (bucket.public) {
    throw new Error(
      `El bucket «${name}» está PÚBLICO pero debe ser PRIVADO; se rechaza la lectura/firma. ` +
        `Corrige la visibilidad en Supabase → Storage (o con scripts/migrate-storage-privacy.ts --apply --finalize).`
    );
  }
  privateVerifiedAt.set(name, Date.now());
}

/** Bucket público de assets. Se crea público solo si no existe. */
export const ensurePublicAssetsBucket = (c?: SupabaseClient) => ensureBucket(c ?? getClient(), PUBLIC_ASSETS_BUCKET, true);
/** Bucket privado de documentos. Falla si existe y es público (pre-migración). */
export const ensurePrivateDocumentsBucket = (c?: SupabaseClient) => ensureBucket(c ?? getClient(), PRIVATE_DOCUMENTS_BUCKET, false);
export const ensureCommunicationsBucket = (c?: SupabaseClient) => ensureBucket(c ?? getClient(), COMMUNICATIONS_BUCKET, false);

// ── PÚBLICO: logos y fotos de la página de reservas ───────────────────────

/** URL pública permanente de un asset público. Rechaza cualquier path fuera de los prefijos públicos. */
export function publicAssetUrl(storagePath: string): string {
  if (!isPublicAssetPath(storagePath)) throw new Error("Not a public asset path");
  return getClient().storage.from(PUBLIC_ASSETS_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/** URL pública de una carpeta de assets públicos (con "/" final), p. ej. para validar fotos propias. */
export function publicAssetFolderUrl(folder: string): string {
  return `${publicAssetUrl(folder.replace(/\/$/, ""))}/`;
}

/** Sube o reemplaza el logo del taller (path fijo por shop). */
export async function uploadShopLogoToStorage(
  shopId: string,
  buffer: Buffer,
  mimeType: string,
  ext: string,
  assetId?: string
): Promise<{ storagePath: string; publicUrl: string }> {
  const supabase = getClient();
  await ensurePublicAssetsBucket(supabase);

  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 5) || "png";
  // Sales preparation uses immutable versions so a late/expired upload cannot
  // overwrite the live logo of a Shop whose lifecycle changed meanwhile.
  const storagePath = `logos/${assertShopSegment(shopId)}/logo${assetId ? `-${assertShopSegment(assetId)}` : ""}.${safeExt}`;
  const { error } = await supabase.storage
    .from(PUBLIC_ASSETS_BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: !assetId });
  if (error) throw new Error(`Supabase upload error: ${error.message}`);
  return { storagePath, publicUrl: publicAssetUrl(storagePath) };
}

/**
 * Foto de la página pública de reservas (portada o taller). Cada subida es un
 * archivo nuevo: el configurador guarda borradores y la página solo cambia al publicar.
 */
export async function uploadBookingPageImageToStorage(
  folder: string,
  kind: string,
  buffer: Buffer
): Promise<{ storagePath: string; publicUrl: string }> {
  const supabase = getClient();
  await ensurePublicAssetsBucket(supabase);

  const storagePath = `${folder}${kind}-${Date.now()}.webp`;
  if (!isPublicAssetPath(storagePath)) throw new Error("Not a public asset path");
  const { error } = await supabase.storage
    .from(PUBLIC_ASSETS_BUCKET)
    .upload(storagePath, buffer, { contentType: "image/webp", upsert: false });
  if (error) throw new Error(`Supabase upload error: ${error.message}`);
  return { storagePath, publicUrl: publicAssetUrl(storagePath) };
}

function assertShopSegment(shopId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(shopId)) throw new Error("Invalid shop id");
  return shopId;
}

// ── PRIVADO: documentos contables / facturas / DVI ────────────────────────

/**
 * Sube un documento privado a `{shopId}/{category}/{timestamp}-{file}`.
 * Devuelve SOLO el storagePath — nunca una URL. Persistir el path en la BD.
 */
export async function uploadPrivateDocument(
  shopId: string,
  category: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ storagePath: string }> {
  const supabase = getClient();
  await ensurePrivateDocumentsBucket(supabase);

  const storagePath = assertTenantStoragePath(
    shopId,
    `${assertShopSegment(shopId)}/${category}/${Date.now()}-${sanitizeStorageFileName(fileName)}`
  );
  const { error } = await supabase.storage
    .from(PRIVATE_DOCUMENTS_BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (error) throw new Error(`Supabase upload error: ${error.message}`);
  return { storagePath };
}

/** Sube o reemplaza el PDF empaquetado para el link de descarga del cliente. */
export async function uploadInvoiceClientPackage(
  shopId: string,
  downloadToken: string,
  buffer: Buffer
): Promise<string> {
  if (!/^[A-Za-z0-9_-]+$/.test(downloadToken)) throw new Error("Invalid download token");
  const supabase = getClient();
  await ensurePrivateDocumentsBucket(supabase);

  const storagePath = assertTenantStoragePath(shopId, `${shopId}/invoice-share/${downloadToken}.pdf`);
  const { error } = await supabase.storage
    .from(PRIVATE_DOCUMENTS_BUCKET)
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`Supabase upload error: ${error.message}`);
  return storagePath;
}

/** Descarga server-side de un documento privado del taller `shopId`. */
export async function downloadPrivateDocument(shopId: string, storagePath: string): Promise<Buffer> {
  const path = assertTenantStoragePath(shopId, storagePath);
  const client = getClient();
  await assertBucketPrivateForRead(client, PRIVATE_DOCUMENTS_BUCKET);
  const { data, error } = await client.storage.from(PRIVATE_DOCUMENTS_BUCKET).download(path);
  if (error || !data) throw new Error(`Supabase download error: ${error?.message ?? "empty"}`);
  return Buffer.from(await data.arrayBuffer());
}

/**
 * URL firmada temporal para un documento privado. Llamar SOLO después de
 * autorizar al usuario (taller, o cliente vía token) sobre el registro dueño del path.
 */
export async function signedUrlForPrivateDocument(
  shopId: string,
  storagePath: string,
  expiresInSeconds = DEFAULT_SIGNED_URL_TTL
): Promise<string> {
  const path = assertTenantStoragePath(shopId, storagePath);
  const client = getClient();
  await assertBucketPrivateForRead(client, PRIVATE_DOCUMENTS_BUCKET);
  const { data, error } = await client.storage
    .from(PRIVATE_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(`Supabase signed URL error: ${error?.message ?? "empty"}`);
  return data.signedUrl;
}

/** Igual que la anterior; devuelve null (no lanza) si un path falla — para listados. */
export async function trySignedUrlForPrivateDocument(
  shopId: string,
  storagePath: string,
  expiresInSeconds = DEFAULT_SIGNED_URL_TTL
): Promise<string | null> {
  try {
    return await signedUrlForPrivateDocument(shopId, storagePath, expiresInSeconds);
  } catch (err) {
    console.error("[storage] signed URL failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── PRIVADO: adjuntos de comunicaciones ───────────────────────────────────

/** Sube un adjunto de Inbox (mensaje entrante/saliente) al bucket privado. */
export async function uploadCommunicationAttachment(
  shopId: string,
  messageId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ storagePath: string }> {
  if (!/^[A-Za-z0-9_-]+$/.test(messageId)) throw new Error("Invalid message id");
  const supabase = getClient();
  await ensureCommunicationsBucket(supabase);

  const storagePath = assertTenantStoragePath(
    shopId,
    `${assertShopSegment(shopId)}/${messageId}/${Date.now()}-${sanitizeStorageFileName(fileName)}`
  );
  const { error } = await supabase.storage
    .from(COMMUNICATIONS_BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (error) throw new Error(`Supabase upload error: ${error.message}`);
  return { storagePath };
}

/** Link temporal para un adjunto privado del taller — nunca URL pública. */
export async function signedUrlForCommunicationAttachment(
  shopId: string,
  storagePath: string,
  expiresInSeconds = DEFAULT_SIGNED_URL_TTL
): Promise<string> {
  const path = assertTenantStoragePath(shopId, storagePath);
  const client = getClient();
  await assertBucketPrivateForRead(client, COMMUNICATIONS_BUCKET);
  const { data, error } = await client.storage
    .from(COMMUNICATIONS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(`Supabase signed URL error: ${error?.message ?? "empty"}`);
  return data.signedUrl;
}
