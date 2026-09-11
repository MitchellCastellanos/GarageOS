// Wrapper para Supabase Storage
// Se usa como backup de los archivos antes de subirlos a Google Drive.
// El cliente de servidor usa la SERVICE_ROLE_KEY para bypass de RLS.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const ACCOUNTING_BUCKET = "accounting";

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not set");
  return createClient(url, key);
}

/** Crea el bucket `accounting` (público) si no existe — requiere service_role. */
export async function ensureAccountingBucket(supabase?: SupabaseClient) {
  const client = supabase ?? getClient();
  const { data: buckets, error: listError } = await client.storage.listBuckets();
  if (listError) {
    throw new Error(`No se pudo listar buckets de Supabase: ${listError.message}`);
  }
  if (buckets?.some((b) => b.name === ACCOUNTING_BUCKET)) return;

  const { error: createError } = await client.storage.createBucket(ACCOUNTING_BUCKET, {
    public: true,
  });
  if (createError) {
    const manual =
      " En Supabase → Storage → New bucket, nombre «accounting», marca «Public bucket».";
    throw new Error(`No se pudo crear el bucket «${ACCOUNTING_BUCKET}»: ${createError.message}.${manual}`);
  }
}

// Sube un archivo al bucket "accounting" y devuelve la URL pública
export async function uploadToStorage(
  shopId: string,
  category: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ storagePath: string; publicUrl: string }> {
  const supabase = getClient();
  await ensureAccountingBucket(supabase);

  // Path: accounting/{shopId}/{category}/{timestamp}-{fileName}
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${shopId}/${category}/${timestamp}-${safeName}`;

  const { error } = await supabase.storage
    .from(ACCOUNTING_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) throw new Error(`Supabase upload error: ${error.message}`);

  const { data } = supabase.storage.from(ACCOUNTING_BUCKET).getPublicUrl(storagePath);

  return { storagePath, publicUrl: data.publicUrl };
}

/** Sube o reemplaza el logo del taller (path fijo por shop). */
export async function uploadShopLogoToStorage(
  shopId: string,
  buffer: Buffer,
  mimeType: string,
  ext: string
): Promise<{ storagePath: string; publicUrl: string }> {
  const supabase = getClient();
  await ensureAccountingBucket(supabase);

  const storagePath = `logos/${shopId}/logo.${ext}`;

  const { error } = await supabase.storage
    .from(ACCOUNTING_BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: true });

  if (error) {
    throw new Error(`Supabase upload error: ${error.message}`);
  }

  const { data } = supabase.storage.from(ACCOUNTING_BUCKET).getPublicUrl(storagePath);
  return { storagePath, publicUrl: data.publicUrl };
}

/** Sube o reemplaza el PDF empaquetado para el link de descarga del cliente. */
export async function uploadInvoiceClientPackage(
  shopId: string,
  downloadToken: string,
  buffer: Buffer
): Promise<string> {
  const supabase = getClient();
  await ensureAccountingBucket(supabase);

  const storagePath = `${shopId}/invoice-share/${downloadToken}.pdf`;

  const { error } = await supabase.storage
    .from(ACCOUNTING_BUCKET)
    .upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) throw new Error(`Supabase upload error: ${error.message}`);

  return storagePath;
}

/** URL pública de un archivo ya subido al bucket accounting. */
export function publicUrlForStoragePath(storagePath: string): string {
  const supabase = getClient();
  const { data } = supabase.storage.from(ACCOUNTING_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

/** Descarga un archivo del bucket accounting por su path interno. */
export async function downloadFromStorage(storagePath: string): Promise<Buffer> {
  const supabase = getClient();
  const { data, error } = await supabase.storage.from(ACCOUNTING_BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`Supabase download error: ${error?.message ?? "empty"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}
