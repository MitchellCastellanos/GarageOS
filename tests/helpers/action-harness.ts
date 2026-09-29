// Permite importar server actions reales en node:test: `server-only`, `@/lib/auth`,
// `next/cache` y `next/navigation` se resuelven a stubs. Importar este módulo ANTES que
// las actions (que se cargan con `await import(...)`).
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const dir = path.dirname(new URL(import.meta.url).pathname);
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
export { RedirectError } from "./stub-next";
