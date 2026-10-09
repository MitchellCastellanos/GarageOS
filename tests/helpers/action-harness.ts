// Permite importar server actions reales en node:test: `server-only`, `@/lib/auth`,
// `next/cache` y `next/navigation` se resuelven a stubs. Importar este módulo ANTES que
// las actions (que se cargan con `await import(...)`).
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const authUrl = pathToFileURL(path.join(dir, "stub-auth.ts")).href;
const nextUrl = pathToFileURL(path.join(dir, "stub-next.ts")).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    if (specifier === "@/lib/auth") return { url: authUrl, shortCircuit: true };
    if (specifier === "next/cache" || specifier === "next/navigation") return { url: nextUrl, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

export { setSession } from "./stub-auth";
export { RedirectError, NotFoundError } from "./stub-next";

// Platform sales staff lookups default to "no staff row" so legacy tests that only mock `user` keep exercising the
// Super Admin / tenant paths. Tests of the sales-staff paths override these with patchDb.
import { db } from "../../src/lib/db";
// (Skipped when a test deliberately runs against a scratch database: GARAGEOS_CRM_TEST_DB_URL.)
if (!process.env.GARAGEOS_CRM_TEST_DB_URL) {
  const staffDelegate = (db as unknown as Record<string, Record<string, unknown>>).platformSalesStaff;
  staffDelegate.findUnique = async () => null;
  staffDelegate.findMany = async () => [];
}
