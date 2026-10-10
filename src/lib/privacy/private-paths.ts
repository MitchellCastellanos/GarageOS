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

function stripQuery(pathname: string): string {
  return pathname.split(/[?#]/)[0] || "/";
}

export function isPrivatePath(pathname: string): boolean {
  const path = stripQuery(pathname);
  return MANAGE_PATH.test(path) || PRIVATE_ROUTE_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}

export function isTokenPath(pathname: string): boolean {
  const path = stripQuery(pathname);
  return MANAGE_PATH.test(path) || TOKEN_ROUTE_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}

/** Páginas públicas que no deben contarse como visitas (réplicas locales sin escrituras). */
const UNTRACKED_PUBLIC_PREFIXES = ["/demo/booking"] as const;

/** ¿Puede registrarse esta ruta en la analítica de visitas? Nunca una ruta privada ni con token. */
export function isTrackablePath(pathname: string): boolean {
  const path = stripQuery(pathname);
  return !isPrivatePath(path) && !UNTRACKED_PUBLIC_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
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
