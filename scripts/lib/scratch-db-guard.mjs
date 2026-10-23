// Safety rules for the disposable PostgreSQL used by the database-backed suites (`tests/*-db.test.ts`).
// PURE functions only (no I/O); unit-tested in tests/scratch-db-guard.test.ts.
//
// The suites WRITE rows, so they must only ever see a local, throwaway database. This mirrors (and is deliberately
// not weaker than) the check each suite performs itself: host localhost or 127.0.0.1 (the suites do not accept
// ::1) and a database name containing replay|test|scratch. It is unrelated to scripts/lib/integration-guard.mjs,
// which guards the separate Neon-preview integration launcher and must not be reused here.

export const SCRATCH_HOSTS = Object.freeze(["localhost", "127.0.0.1"]);
export const SCRATCH_NAME = /(replay|test|scratch)/i;
export const MAX_DB_NAME = 63;

/** Returns { ok: true, url, database } or { ok: false, reason }. Never includes the password in `reason`. */
export function checkScratchUrl(raw) {
  if (!raw || typeof raw !== "string") return { ok: false, reason: "GARAGEOS_CRM_TEST_DB_URL is not set" };
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "URL is not parseable" };
  }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") return { ok: false, reason: `protocol ${u.protocol} is not postgres` };
  if (!SCRATCH_HOSTS.includes(u.hostname)) return { ok: false, reason: `host "${u.hostname}" is not localhost/127.0.0.1` };
  const name = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!name || name.includes("/")) return { ok: false, reason: "no database name in URL" };
  if (!SCRATCH_NAME.test(name)) return { ok: false, reason: `database name "${name}" does not contain replay|test|scratch` };
  if (/neon|supabase|amazonaws|vercel/i.test(raw)) return { ok: false, reason: "URL looks like a hosted provider" };
  return { ok: true, url: u, database: name };
}

/** Per-suite database name derived from the template name; keeps the test pattern and fits in 63 bytes. */
export function suiteDatabaseName(templateName, suiteFile) {
  const slug = suiteFile.replace(/^.*\//, "").replace(/\.test\.ts$/, "").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const name = `${templateName}__${slug}`;
  return name.length > MAX_DB_NAME ? name.slice(0, MAX_DB_NAME) : name;
}
