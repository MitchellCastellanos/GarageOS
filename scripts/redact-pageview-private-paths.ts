// Elimina de PageView las visitas guardadas en rutas privadas o con token (portal, aprobación de cotización,
// reporte de inspección, gestión de cita, páginas de ventas, recuperación de cuenta…). Antes de este cambio el
// beacon registraba el path completo, token incluido, y esos tokens quedaban en la base y en el panel de analítica.
//
//   npx tsx scripts/redact-pageview-private-paths.ts                 # simulación: solo cuenta (por defecto)
//   npx tsx scripts/redact-pageview-private-paths.ts --apply          # borra
//   npx tsx scripts/redact-pageview-private-paths.ts --allow-remote   # necesario si DATABASE_URL no es local
//
// Garantías:
//  - Simulación por defecto: sin --apply no se escribe nada.
//  - Nunca imprime paths ni tokens: solo conteos por familia de ruta.
//  - Solo toca la tabla PageView (analítica propia, sin datos de negocio) y solo filas cuyo path coincide con una
//    ruta privada según src/lib/privacy/private-paths.ts.
//  - Idempotente: repetirlo no borra nada más.
import { db } from "@/lib/db";
import { privatePathRegexSources } from "@/lib/privacy/private-paths";

const apply = process.argv.includes("--apply");
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

async function main() {
  if (!allowRemote && !isLocalDatabase()) {
    console.error("La base de datos no es local. Revisa DATABASE_URL y vuelve a ejecutar con --allow-remote si es lo que quieres.");
    process.exit(2);
  }

  const families = privatePathRegexSources().map(({ label, source }) => ({ label, regex: source }));

  let total = 0;
  for (const family of families) {
    const rows = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM "garageos"."PageView" WHERE "path" ~ ${family.regex}`;
    const n = Number(rows[0]?.n ?? 0);
    total += n;
    if (n > 0) console.log(`${family.label.padEnd(28)} ${n}`);
  }
  console.log(`\nFilas a eliminar: ${total}`);

  if (!apply) {
    console.log("Simulación: no se borró nada. Ejecuta con --apply para eliminar.");
    return;
  }
  let deleted = 0;
  for (const family of families) {
    deleted += await db.$executeRaw`DELETE FROM "garageos"."PageView" WHERE "path" ~ ${family.regex}`;
  }
  console.log(`Eliminadas: ${deleted}`);
}

main()
  .catch((error) => {
    console.error("Falló:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
