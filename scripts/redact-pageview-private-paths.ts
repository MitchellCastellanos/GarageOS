// Elimina de PageView las visitas guardadas en rutas privadas o con token (portal, aprobación de cotización,
// reporte de inspección, gestión de cita, páginas de ventas, recuperación de cuenta…). Antes de este cambio el
// beacon registraba el path completo, token incluido, y esos tokens quedaban en la base y en el panel de analítica.
//
//   npx tsx scripts/redact-pageview-private-paths.ts                 # simulación: solo cuenta (por defecto)
//   npx tsx scripts/redact-pageview-private-paths.ts --report         # + informe de exposición (solo conteos)
//   npx tsx scripts/redact-pageview-private-paths.ts --apply          # borra
//   npx tsx scripts/redact-pageview-private-paths.ts --allow-remote   # necesario si DATABASE_URL no es local
//
// Garantías:
//  - Simulación por defecto: sin --apply no se escribe nada. Todo el informe es de solo lectura (SELECT/COUNT).
//  - Nunca imprime paths, tokens, hosts de referencia ni datos personales: solo conteos.
//  - Con --report los tokens se leen en memoria para comprobar si siguen vigentes (comparando hash o valor contra las
//    tablas de acceso); no se imprimen ni se escriben en ningún sitio.
//  - Solo toca la tabla PageView (analítica propia, sin datos de negocio) y solo filas cuya ruta es privada según
//    src/lib/privacy/private-paths.ts (incluidas variantes: mayúsculas, %xx, `//`, `..`, `\`).
//  - Idempotente: repetirlo no borra nada más.
//  - Recomendado antes de --apply: copia de seguridad o punto de restauración (PITR) y revisar los conteos del informe.
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { isPrivatePath, looksLikeToken, privatePathRegexSources } from "@/lib/privacy/private-paths";

const apply = process.argv.includes("--apply");
const report = process.argv.includes("--report");
const allowRemote = process.argv.includes("--allow-remote");

function isLocalDatabase(): boolean {
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || "";
  try {
    const host = new URL(raw).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

const SEARCH_ENGINE_HOST = "^(www\\.)?(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia|startpage|qwant)\\.[a-z.]+$|^search\\.brave\\.com$";
// Formas raras que la regla simple no cubre: porcentaje, barras repetidas o invertidas, puntos, sin barra inicial.
const ODD_FORM = "[%\\\\]|//|/\\.\\.?(/|$)|^[^/]";
const TOKEN_LIKE_SQL = "[A-Za-z0-9_-]{24,}";

async function count(sql: TemplateStringsArray, ...values: unknown[]): Promise<number> {
  const rows = await db.$queryRaw<{ n: bigint }[]>(sql, ...values);
  return Number(rows[0]?.n ?? 0);
}

/** Ids de filas con forma rara cuya ruta, una vez normalizada, resulta privada. Solo ids: nunca se imprimen rutas. */
async function oddFormPrivateIds(): Promise<string[]> {
  const ids: string[] = [];
  let cursor = "";
  for (;;) {
    const rows = await db.$queryRaw<{ id: string; path: string }[]>`
      SELECT "id", "path" FROM "garageos"."PageView"
      WHERE "path" ~ ${ODD_FORM} AND "id" > ${cursor}
      ORDER BY "id" LIMIT 1000`;
    if (rows.length === 0) break;
    for (const row of rows) if (isPrivatePath(row.path)) ids.push(row.id);
    cursor = rows[rows.length - 1].id;
  }
  return ids;
}

async function readPrivateTokens() {
  const portal = new Set<string>();
  const quote = new Set<string>();
  const inspection = new Set<string>();
  const manage = new Set<string>();
  let cursor = "";
  for (;;) {
    const rows = await db.$queryRaw<{ id: string; path: string }[]>`
      SELECT "id", "path" FROM "garageos"."PageView"
      WHERE ("path" ~* '^/(portal|quote|inspection)/[^/]+' OR "path" ~* '^/book/[^/]+/manage/[^/]+') AND "id" > ${cursor}
      ORDER BY "id" LIMIT 1000`;
    if (rows.length === 0) break;
    for (const { path } of rows) {
      const m = /^\/(portal|quote|inspection)\/([^/?#]+)/i.exec(path) ?? /^\/book\/[^/]+\/(manage)\/([^/?#]+)/i.exec(path);
      if (!m) continue;
      const token = decodeURIComponent(m[2]);
      const kind = m[1].toLowerCase();
      (kind === "portal" ? portal : kind === "quote" ? quote : kind === "inspection" ? inspection : manage).add(token);
    }
    cursor = rows[rows.length - 1].id;
  }
  return { portal, quote, inspection, manage };
}

const chunk = <T,>(items: T[], size = 500): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

async function printReport(oddOnly: number) {
  console.log("\n── Informe de exposición (solo conteos) ──");
  const total = await count`SELECT COUNT(*)::bigint AS n FROM "garageos"."PageView"`;
  const range = await db.$queryRaw<{ min: Date | null; max: Date | null }[]>`SELECT MIN("createdAt") AS min, MAX("createdAt") AS max FROM "garageos"."PageView"`;
  console.log(`PageView total: ${total}  (${range[0]?.min?.toISOString().slice(0, 10) ?? "-"} → ${range[0]?.max?.toISOString().slice(0, 10) ?? "-"})`);

  const privateRegex = privatePathRegexSources().map((s) => s.source).join("|");
  const privateRows = await count`SELECT COUNT(*)::bigint AS n FROM "garageos"."PageView" WHERE "path" ~* ${privateRegex}`;
  const privateVisitors = await count`SELECT COUNT(DISTINCT "visitorHash")::bigint AS n FROM "garageos"."PageView" WHERE "path" ~* ${privateRegex}`;
  const privateDistinct = await count`SELECT COUNT(DISTINCT "path")::bigint AS n FROM "garageos"."PageView" WHERE "path" ~* ${privateRegex}`;
  const privRange = await db.$queryRaw<{ min: Date | null; max: Date | null }[]>`SELECT MIN("createdAt") AS min, MAX("createdAt") AS max FROM "garageos"."PageView" WHERE "path" ~* ${privateRegex}`;
  console.log(`Filas en rutas privadas: ${privateRows} (+ ${oddOnly} variantes con codificación o barras raras) · rutas distintas: ${privateDistinct} · visitantes distintos (hash diario): ${privateVisitors}`);
  console.log(`Rango de fechas de esas filas: ${privRange[0]?.min?.toISOString().slice(0, 10) ?? "-"} → ${privRange[0]?.max?.toISOString().slice(0, 10) ?? "-"}`);

  const withReferrer = await count`SELECT COUNT(*)::bigint AS n FROM "garageos"."PageView" WHERE "path" ~* ${privateRegex} AND "referrerHost" <> ''`;
  const fromSearch = await count`SELECT COUNT(*)::bigint AS n FROM "garageos"."PageView" WHERE "path" ~* ${privateRegex} AND "referrerHost" ~* ${SEARCH_ENGINE_HOST}`;
  console.log(`Filas privadas con referrer externo: ${withReferrer} · de ellas desde buscadores: ${fromSearch}  (un buscador como referrer indicaría indexación)`);

  console.log("\nOtros campos (toda la tabla):");
  console.log(`  utm_* con forma de token:            ${await count`SELECT COUNT(*)::bigint AS n FROM "garageos"."PageView" WHERE "utmSource" ~ ${TOKEN_LIKE_SQL} OR "utmMedium" ~ ${TOKEN_LIKE_SQL} OR "utmCampaign" ~ ${TOKEN_LIKE_SQL}`}`);
  console.log(`  shopSlug con forma de token:         ${await count`SELECT COUNT(*)::bigint AS n FROM "garageos"."PageView" WHERE "shopSlug" ~ ${TOKEN_LIKE_SQL}`}`);
  console.log(`  referrerHost con forma de token:     ${await count`SELECT COUNT(*)::bigint AS n FROM "garageos"."PageView" WHERE "referrerHost" ~ ${TOKEN_LIKE_SQL}`}`);
  console.log(`  path con query o hash:               ${await count`SELECT COUNT(*)::bigint AS n FROM "garageos"."PageView" WHERE "path" ~ '[?#]'`}`);
  console.log(`  path público con tramo tipo token:   ${await count`SELECT COUNT(*)::bigint AS n FROM "garageos"."PageView" WHERE "path" ~ ${"/" + TOKEN_LIKE_SQL} AND NOT ("path" ~* ${privateRegex}) AND "path" !~ ${ODD_FORM}`}`);

  const tokens = await readPrivateTokens();
  const now = new Date();
  let portalValid = 0;
  for (const part of chunk([...tokens.portal])) {
    portalValid += await db.customerPortalAccess.count({
      where: { tokenHash: { in: part.map((t) => createHash("sha256").update(t).digest("hex")) }, revokedAt: null, expiresAt: { gt: now } },
    });
  }
  let quoteValid = 0;
  for (const part of chunk([...tokens.quote])) {
    quoteValid += await db.quote.count({ where: { approvalToken: { in: part }, approvalTokenConsumedAt: null, approvalTokenExpiresAt: { gt: now } } });
  }
  let inspectionActive = 0;
  for (const part of chunk([...tokens.inspection])) {
    inspectionActive += await db.inspection.count({ where: { shareToken: { in: part } } });
  }
  let manageValid = 0;
  for (const part of chunk([...tokens.manage])) {
    manageValid += await db.appointment.count({ where: { manageToken: { in: part }, status: { in: ["SCHEDULED", "CONFIRMED"] }, startsAt: { gt: now } } });
  }
  console.log("\nTokens distintos vistos en la analítica → todavía utilizables hoy:");
  console.log(`  portal del cliente (30 días, revocable): ${tokens.portal.size} vistos → ${portalValid} vigentes`);
  console.log(`  aprobación de cotización (30 días):      ${tokens.quote.size} vistos → ${quoteValid} vigentes`);
  console.log(`  reporte de inspección compartido:        ${tokens.inspection.size} vistos → ${inspectionActive} con enlace activo`);
  console.log(`  gestión de cita (cita futura):           ${tokens.manage.size} vistos → ${manageValid} utilizables`);
  if ([...tokens.portal, ...tokens.quote, ...tokens.inspection, ...tokens.manage].some((t) => !looksLikeToken(t))) {
    console.log("  (algunos segmentos no tienen forma de token: pueden ser rutas de prueba o peticiones inválidas)");
  }
}

async function main() {
  if (!allowRemote && !isLocalDatabase()) {
    console.error("La base de datos no es local. Revisa DATABASE_URL y vuelve a ejecutar con --allow-remote si es lo que quieres.");
    process.exit(2);
  }

  const families = privatePathRegexSources().map(({ label, source }) => ({ label, regex: source }));
  let total = 0;
  for (const family of families) {
    const n = await count`SELECT COUNT(*)::bigint AS n FROM "garageos"."PageView" WHERE "path" ~* ${family.regex}`;
    total += n;
    if (n > 0) console.log(`${family.label.padEnd(28)} ${n}`);
  }
  const oddIds = await oddFormPrivateIds();
  // Las variantes raras que además coinciden con la regla simple ya están contadas arriba.
  const oddOnly = oddIds.length ? await count`SELECT COUNT(*)::bigint AS n FROM "garageos"."PageView" WHERE "id" = ANY(${oddIds}) AND NOT ("path" ~* ${privatePathRegexSources().map((s) => s.source).join("|")})` : 0;
  total += oddOnly;
  if (oddOnly > 0) console.log(`${"variantes (%xx, //, .., \\)".padEnd(28)} ${oddOnly}`);
  console.log(`\nFilas a eliminar: ${total}`);

  if (report) await printReport(oddOnly);

  if (!apply) {
    console.log("\nSimulación: no se borró nada. Ejecuta con --apply para eliminar (antes: copia de seguridad / punto de restauración).");
    return;
  }
  let deleted = 0;
  for (const family of families) {
    deleted += await db.$executeRaw`DELETE FROM "garageos"."PageView" WHERE "path" ~* ${family.regex}`;
  }
  for (const part of chunk(oddIds, 500)) {
    deleted += await db.$executeRaw`DELETE FROM "garageos"."PageView" WHERE "id" = ANY(${part})`;
  }
  console.log(`Eliminadas: ${deleted}`);
}

main()
  .catch((error) => {
    console.error("Falló:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
