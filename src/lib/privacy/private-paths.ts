/**
 * Rutas que nunca deben indexarse, cachearse en buscadores ni registrarse en la analítica propia:
 *  - Rutas con un token secreto en la URL (acceso por enlace): portal, aprobación de cotización, reporte de
 *    inspección, gestión de cita, páginas de ventas, recuperación de cuenta y activación de demo.
 *  - Rutas de aplicación con sesión: /admin, /platform, /api.
 *
 * Fuente única para robots.ts, las cabeceras de next.config.ts, el beacon de analítica y su endpoint.
 *
 * `noindex` / `Disallow` NO son una medida de seguridad: el control de acceso es el propio token (alta entropía,
 * guardado como hash, con caducidad y revocable) o la sesión. Esto solo evita que buscadores y la analítica
 * propia copien o publiquen esas URLs.
 */

/** Prefijos de ruta (sin barra final). El match es por segmento: "/sales" no coincide con "/sales-invite". */
export const PRIVATE_ROUTE_PREFIXES = [
  "/admin",
  "/platform",
  "/api",
  "/portal",
  "/quote",
  "/inspection",
  "/sales",
  "/sales-invite",
  "/sales-recover",
  "/sales-recovery-email",
  "/account-recovery",
  "/activate-demo",
] as const;

/** Subconjunto cuyo enlace lleva un token secreto (o un identificador de un solo uso) y por tanto no debe filtrarse por Referer. */
export const TOKEN_ROUTE_PREFIXES = [
  "/portal",
  "/quote",
  "/inspection",
  "/sales",
  "/sales-invite",
  "/sales-recover",
  "/sales-recovery-email",
  "/account-recovery",
  "/activate-demo",
] as const;

/** Gestión de cita por el cliente: /book/<slug>/manage/<token>. El resto de /book/<slug> es la página pública del taller. */
const MANAGE_PATH = /^\/book\/[^/]+\/manage(?:\/|$)/;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const MAX_PATH_LENGTH = 2048;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

function collapseSegments(path: string): string {
  const out: string[] = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return `/${out.join("/")}`;
}

/**
 * Forma comparable de una ruta recibida (del cliente, de un log, de una fila antigua): decodifica el porcentaje
 * (hasta 3 pasadas, para `%2571uote`), quita query y hash, unifica `\` y `//`, resuelve `.`/`..`, quita la barra final y
 * pasa a minúsculas. Devuelve `null` si no es una ruta analizable (vacía, demasiado larga o con codificación inválida):
 * quien llama debe tratarla como privada.
 */
export function normalizeForMatching(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PATH_LENGTH) return null;
  let value = raw;
  for (let pass = 0; pass < 3; pass++) {
    // Query y hash fuera en cada pasada: `%3F` o `%23` decodificados también los abren.
    value = value.split(/[?#]/)[0];
    if (!value.includes("%")) break;
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      return null;
    }
  }
  value = value.split(/[?#]/)[0].replace(CONTROL_CHARS, "");
  if (value.includes("%")) return null; // sigue codificado tras 3 pasadas: no es una ruta normal
  return collapseSegments(value).toLowerCase();
}

/**
 * Forma que se guarda en la analítica: sin query ni hash, sin caracteres de control, con `//` y `..` resueltos y sin
 * barra final. Conserva mayúsculas y codificación (no se altera lo que ve el panel). `null` si no es analizable.
 */
export function normalizeForStorage(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PATH_LENGTH) return null;
  const value = raw.split(/[?#]/)[0].replace(CONTROL_CHARS, "");
  if (!value.startsWith("/")) return null;
  return collapseSegments(value);
}

export function isPrivatePath(pathname: string): boolean {
  const path = normalizeForMatching(pathname);
  if (path === null) return true; // ante la duda, privada
  return MANAGE_PATH.test(path) || PRIVATE_ROUTE_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}

export function isTokenPath(pathname: string): boolean {
  const path = normalizeForMatching(pathname);
  if (path === null) return true;
  return MANAGE_PATH.test(path) || TOKEN_ROUTE_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}

/** Páginas públicas que no deben contarse como visitas (réplicas locales sin escrituras). */
const UNTRACKED_PUBLIC_PREFIXES = ["/demo/booking"] as const;

/** ¿Puede registrarse esta ruta en la analítica de visitas? Nunca una ruta privada, con token, ni una ruta no analizable. */
export function isTrackablePath(pathname: string): boolean {
  const path = normalizeForMatching(pathname);
  if (path === null) return false;
  return !isPrivatePath(path) && !UNTRACKED_PUBLIC_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}

// ── Campos de analítica distintos de la ruta ─────────────────────────────────────────────────────────────────

/** Una cadena tipo token: 24+ caracteres url-safe seguidos (los tokens de GarageOS son hex/base64url largos). */
const TOKEN_LIKE = /[A-Za-z0-9_-]{24,}/;

export function looksLikeToken(value: string): boolean {
  return TOKEN_LIKE.test(value);
}

/** utm_* viene del query de la página visitada (lo controla quien enlaza): nunca se guarda algo con forma de token. */
export function sanitizeCampaignValue(value: unknown): string {
  if (typeof value !== "string") return "";
  const clean = value.replace(CONTROL_CHARS, "").trim().slice(0, 100);
  return looksLikeToken(clean) ? "" : clean;
}

const SHOP_SLUG = /^[a-z0-9][a-z0-9-]{0,98}$/;

/**
 * El slug del taller se deriva SIEMPRE de la ruta ya normalizada, no del cuerpo de la petición (el cliente podría
 * enviar cualquier cosa, incluido un token).
 */
export function shopSlugFromPath(storagePath: string): string {
  const match = /^\/book\/([^/]+)(?:\/|$)/.exec(storagePath);
  const slug = match?.[1]?.toLowerCase() ?? "";
  return SHOP_SLUG.test(slug) && !looksLikeToken(slug) ? slug : "";
}

/** Patrones de `source` de Next (`headers()`) para las familias anteriores. */
export const PRIVATE_HEADER_SOURCES: string[] = [
  ...PRIVATE_ROUTE_PREFIXES.map((prefix) => `${prefix}/:path*`),
  "/book/:slug/manage/:path*",
];
export const TOKEN_HEADER_SOURCES: string[] = [
  ...TOKEN_ROUTE_PREFIXES.map((prefix) => `${prefix}/:path*`),
  "/book/:slug/manage/:path*",
];

/**
 * Las mismas familias como expresiones regulares (sintaxis compatible con JS y con el `~` de PostgreSQL), para
 * limpiar datos ya guardados (scripts/redact-pageview-private-paths.ts).
 */
export function privatePathRegexSources(): Array<{ label: string; source: string }> {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
  return [
    ...PRIVATE_ROUTE_PREFIXES.map((prefix) => ({ label: prefix as string, source: `^${escape(prefix)}(/|$)` })),
    { label: "/book/<slug>/manage", source: "^/book/[^/]+/manage(/|$)" },
  ];
}
