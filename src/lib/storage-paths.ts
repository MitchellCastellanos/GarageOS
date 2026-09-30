// Validación pura de paths de Storage (sin dependencias de Supabase) — testeable
// y reutilizable. Toda ruta privada debe pertenecer al taller que la pide.

const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

/** Nombre de archivo seguro para usar dentro de una key de Storage. */
export function sanitizeStorageFileName(fileName: string): string {
  const cleaned = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "_");
  return cleaned.slice(0, 120) || "file";
}

/** True si `path` es una key relativa "limpia": sin "..", "//", "/" inicial, "%", backslash ni control chars. */
export function isCleanStoragePath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return false;
  if (path.startsWith("/") || path.endsWith("/")) return false;
  if (CONTROL_OR_BACKSLASH.test(path) || path.includes("%")) return false;
  return path.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

/**
 * True si `path` es una key limpia dentro de `{shopId}/…`. Es la barrera de
 * aislamiento multi-tenant de todos los helpers privados: aunque una ruta llegue
 * de la BD o de un request manipulado, otro taller no puede leerla.
 */
export function isTenantStoragePath(shopId: string, path: unknown): path is string {
  if (!shopId || !/^[A-Za-z0-9_-]+$/.test(shopId)) return false;
  return isCleanStoragePath(path) && path.startsWith(`${shopId}/`) && path.length > shopId.length + 1;
}

export function assertTenantStoragePath(shopId: string, path: unknown): string {
  if (!isTenantStoragePath(shopId, path)) throw new Error("Invalid storage path for this shop");
  return path;
}

/** Prefijos permitidos en el bucket público (solo assets públicos por diseño). */
export const PUBLIC_ASSET_PREFIXES = ["logos/", "booking-page/"] as const;

export function isPublicAssetPath(path: unknown): path is string {
  return isCleanStoragePath(path) && PUBLIC_ASSET_PREFIXES.some((p) => path.startsWith(p));
}

/** Extrae bucket + path de una URL pública heredada de Supabase (`…/storage/v1/object/public/{bucket}/{path}[?query]`). */
export function parseSupabasePublicUrl(url: unknown): { bucket: string; path: string; query: string } | null {
  if (typeof url !== "string") return null;
  const m = /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/([^/]+)\/([^?#]+)(\?[^#]*)?$/.exec(url);
  if (!m) return null;
  return { bucket: m[1], path: m[2], query: m[3] ?? "" };
}

/**
 * Reescribe una URL pública heredada del bucket `accounting` hacia `public-assets`
 * SOLO si el path es un asset público (logos / booking-page). Devuelve null si no aplica.
 */
export function rewriteLegacyPublicAssetUrl(url: unknown): { from: string; to: string; path: string } | null {
  const p = parseSupabasePublicUrl(url);
  if (!p || p.bucket !== "accounting" || !isPublicAssetPath(p.path)) return null;
  return { from: url as string, to: (url as string).replace("/object/public/accounting/", "/object/public/public-assets/"), path: p.path };
}
