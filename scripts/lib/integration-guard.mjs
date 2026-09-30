// Safety logic for the real-database integration suite. PURE functions only (no I/O) so every rule is
// unit-tested in tests/integration-runner.test.ts. The runner (scripts/run-integration.mjs) performs the I/O
// and feeds the results through these checks; nothing here reads credentials from disk or prints them.
//
// The integration suite WRITES test data (shops, users, 10,000-row imports…) and never cleans up after
// itself. It must only ever run against the one authorized, disposable, non-Production database below.
// To authorize a different database, change AUTHORIZED_TARGET in a reviewed commit — never via environment.

/** The ONLY database the suite may run against. All three identifiers are reported by the server itself. */
export const AUTHORIZED_TARGET = Object.freeze({
  orgId: "org-blue-union-70501359", // only used by --neon to address neonctl; never part of the identity check
  projectId: "autumn-art-59701921",
  branchId: "br-winter-glitter-ae575zlf",
  branchName: "preview",
  database: "garageos_replay",
  role: "neondb_owner",
});

/** Neon branch IDs that are Production (defense in depth — the allowlist above already excludes them). */
export const DENIED_BRANCH_IDS = Object.freeze(["br-long-mountain-aeo7kyj3"]);

/** Environment variable that carries the integration database URL into the runner. DATABASE_URL is never read. */
export const URL_ENV_VAR = "GARAGEOS_INTEGRATION_DATABASE_URL";

/** Explicit opt-in: either this env var, or the --yes-write-test-data flag. */
export const OPT_IN_ENV_VAR = "GARAGEOS_INTEGRATION_DB";
export const OPT_IN_FLAG = "--yes-write-test-data";

/** Set by the runner in the child; tests/integration/helpers.ts refuses to run without it. */
export const VERIFIED_MARKER_ENV_VAR = "GARAGEOS_INTEGRATION_VERIFIED_TARGET";

/** Only these OS/runtime variables reach the tests (everything else, including all provider secrets, is dropped). */
export const CHILD_ENV_ALLOWLIST = Object.freeze([
  "PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "ComSpec", "COMSPEC", "windir", "WINDIR",
  "TEMP", "TMP", "TMPDIR", "USERPROFILE", "HOME", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA",
  "LANG", "LC_ALL", "TZ", "SHELL", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE",
]);

/** Names that must never be present in the child environment (defense in depth on top of the allowlist). */
export const FORBIDDEN_CHILD_ENV = /^(STRIPE_|TWILIO_|RESEND_|EMAIL_|PUSHER_|NEXT_PUBLIC_PUSHER|TELEGRAM_|SUPABASE_|NEXT_PUBLIC_SUPABASE|GOOGLE_|QBO_|CRON_SECRET|PLATFORM_ADMIN|NEXTAUTH|AUTH_|INTEGRATIONS_ENCRYPTION|VERCEL|DIRECT_URL|DATABASE_URL_POOLED|RUN_DB_STEPS|DEPLOY_MIGRATIONS_|NEON_API_KEY|PG(HOST|USER|PASSWORD|DATABASE|PORT|SSLMODE)$)/i;

const fail = (failures, code, detail) => failures.push({ code, detail });

/** Opt-in must be explicit: the env var set to exactly "1", or the CLI flag. */
export function checkOptIn(env, argv) {
  return env[OPT_IN_ENV_VAR] === "1" || argv.includes(OPT_IN_FLAG);
}

/** Structural facts about a connection URL (no secrets in the result). */
export function describeConnection(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { parses: false };
  }
  const host = u.hostname;
  return {
    parses: true,
    scheme: u.protocol.replace(":", ""),
    database: decodeURIComponent(u.pathname.replace(/^\//, "")),
    pooled: host.includes("-pooler"),
    endpointId: host.split(".")[0],
    neonHost: host.endsWith(".neon.tech"),
  };
}

/**
 * Decide whether a target may be used. Inputs are facts gathered by the runner:
 *  - url:        the connection string (only structurally inspected)
 *  - identity:   { projectId, branchId, database } as REPORTED BY THE SERVER (null/undefined = unknown)
 *  - migrations: rows of public._prisma_migrations { migration_name, finished_at, rolled_back_at }
 *  - repoMigrations: names of the migration directories in the repository
 * Returns { ok, failures:[{code, detail}] }. Any unknown value fails closed.
 */
export function evaluateTarget({ url, identity, migrations, repoMigrations, target = AUTHORIZED_TARGET }) {
  const failures = [];

  const conn = describeConnection(url ?? "");
  if (!conn.parses) fail(failures, "URL_UNPARSABLE", "the integration connection string is not a valid URL");
  else {
    if (!/^postgres(ql)?$/.test(conn.scheme)) fail(failures, "URL_SCHEME", "not a postgres URL");
    if (conn.pooled) fail(failures, "URL_POOLED", "the direct (non-pooler) endpoint is required");
    if (!conn.neonHost) fail(failures, "URL_NOT_NEON", "host is not a Neon endpoint");
    if (conn.database !== target.database) fail(failures, "URL_DATABASE", `URL database is not ${target.database}`);
  }

  const id = identity ?? {};
  if (!id.projectId) fail(failures, "IDENTITY_UNKNOWN_PROJECT", "server did not report neon.project_id");
  else if (id.projectId !== target.projectId) fail(failures, "WRONG_PROJECT", `server project ${id.projectId} is not ${target.projectId}`);
  if (!id.branchId) fail(failures, "IDENTITY_UNKNOWN_BRANCH", "server did not report neon.branch_id");
  else {
    if (DENIED_BRANCH_IDS.includes(id.branchId)) fail(failures, "PRODUCTION_BRANCH", `branch ${id.branchId} is Production`);
    if (id.branchId !== target.branchId) fail(failures, "WRONG_BRANCH", `server branch ${id.branchId} is not ${target.branchId}`);
  }
  if (!id.database) fail(failures, "IDENTITY_UNKNOWN_DATABASE", "server did not report current_database()");
  else if (id.database !== target.database) fail(failures, "WRONG_DATABASE", `server database ${id.database} is not ${target.database}`);

  const rows = Array.isArray(migrations) ? migrations : null;
  if (!rows) fail(failures, "MIGRATIONS_UNREADABLE", "could not read public._prisma_migrations");
  else {
    const repo = new Set(repoMigrations ?? []);
    if (repo.size === 0) fail(failures, "REPO_MIGRATIONS_EMPTY", "no repository migrations found");
    const bad = rows.filter((r) => !r.finished_at || r.rolled_back_at);
    if (bad.length) fail(failures, "MIGRATION_FAILED_OR_ROLLED_BACK", `${bad.length} migration row(s) are unfinished or rolled back`);
    const done = new Set(rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name));
    const missing = [...repo].filter((n) => !done.has(n));
    if (missing.length) fail(failures, "MIGRATIONS_MISSING", `${missing.length} repository migration(s) not applied (first: ${missing[0]})`);
    const extra = rows.map((r) => r.migration_name).filter((n) => !repo.has(n));
    if (extra.length) fail(failures, "MIGRATIONS_UNKNOWN", `${extra.length} applied migration(s) are not in the repository (first: ${extra[0]})`);
    const names = rows.map((r) => r.migration_name);
    if (names.length !== new Set(names).size) fail(failures, "MIGRATIONS_DUPLICATE", "duplicate migration names in _prisma_migrations");
  }

  return { ok: failures.length === 0, failures };
}

/**
 * Build the child environment from scratch: allowlisted OS variables + the verified database URL + the
 * opt-in and verified-target markers. Provider/application secrets are never copied, whatever the parent has.
 */
export function buildChildEnv(parentEnv, databaseUrl, target = AUTHORIZED_TARGET) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const k of CHILD_ENV_ALLOWLIST) if (parentEnv[k] !== undefined) env[k] = parentEnv[k];
  env.DATABASE_URL = databaseUrl;
  env[OPT_IN_ENV_VAR] = "1";
  env[VERIFIED_MARKER_ENV_VAR] = `${target.projectId}/${target.branchId}/${target.database}`;
  return env;
}

/** Names in `env` that must not reach the tests (used as a last assertion before spawning). */
export function findForbiddenChildEnv(env) {
  return Object.keys(env).filter((k) => FORBIDDEN_CHILD_ENV.test(k));
}

/**
 * Called from tests/integration/helpers.ts: real-DB mode without a runner-verified target is refused
 * loudly, so `tsx --test tests/integration` with a hand-set DATABASE_URL can never bypass the gates.
 */
export function requireVerifiedRunner(env, target = AUTHORIZED_TARGET) {
  if (env[OPT_IN_ENV_VAR] !== "1") return false; // suite disabled: tests skip
  const expected = `${target.projectId}/${target.branchId}/${target.database}`;
  if (env[VERIFIED_MARKER_ENV_VAR] !== expected) {
    throw new Error(
      "Refusing to run integration tests: the target database was not verified. Use `npm run test:integration` " +
        "(scripts/run-integration.mjs), which validates the database identity first. See docs/integration-testing.md."
    );
  }
  return true;
}

/** Remove anything URL-shaped from text before it is printed or logged. */
export function redact(text) {
  return String(text ?? "")
    .replace(/postgres(ql)?:\/\/[^\s"']+/gi, "<redacted-url>")
    .replace(/(password|passwd|pwd)=\S+/gi, "$1=<redacted>");
}
