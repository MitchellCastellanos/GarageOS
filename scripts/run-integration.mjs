#!/usr/bin/env node
// Fail-closed launcher for the real-PostgreSQL integration suite (`npm run test:integration`).
// Works the same on Windows, macOS and Linux (no shell env-prefix syntax, no shell globbing).
//
// The suite writes test data and never cleans up. This launcher refuses to start it unless the target
// database is positively identified — by the SERVER's own answers, not by the URL — as the authorized,
// non-Production integration database (see AUTHORIZED_TARGET in scripts/lib/integration-guard.mjs).
//
// Usage:
//   GARAGEOS_INTEGRATION_DB=1 GARAGEOS_INTEGRATION_DATABASE_URL=<direct url> npm run test:integration
//   npm run test:integration -- --yes-write-test-data --neon         # fetch the URL through the authenticated neonctl
//   npm run test:integration -- --dry-run ...                        # run every gate, start no tests
//   npm run test:integration -- --yes-write-test-data import.test.ts # a subset of files
//   npm run test:integration -- --yes-write-test-data -- --test-name-pattern="XLSX"   # extra node:test flags
//
// The caller's DATABASE_URL is deliberately ignored and never forwarded.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORIZED_TARGET, OPT_IN_ENV_VAR, OPT_IN_FLAG, URL_ENV_VAR,
  buildChildEnv, checkOptIn, evaluateTarget, findForbiddenChildEnv, redact,
} from "./lib/integration-guard.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = (m) => process.stdout.write(m + "\n");
const refuse = (m) => {
  process.stderr.write(`\n[integration] REFUSED — no tests were started.\n${m}\n`);
  process.exit(1);
};

const argv = process.argv.slice(2);
const dd = argv.indexOf("--");
const ownArgs = dd === -1 ? argv : argv.slice(0, dd);
const extraNodeArgs = dd === -1 ? [] : argv.slice(dd + 1);
const dryRun = ownArgs.includes("--dry-run");
const viaNeon = ownArgs.includes("--neon");
const fileArgs = ownArgs.filter((a) => !a.startsWith("--"));

// 1. explicit opt-in
if (!checkOptIn(process.env, ownArgs)) {
  refuse(`Integration tests create test data. Opt in explicitly with ${OPT_IN_ENV_VAR}=1 or the ${OPT_IN_FLAG} flag.`);
}

// 2. obtain the URL (never DATABASE_URL)
function neonUrl() {
  const t = AUTHORIZED_TARGET;
  const r = spawnSync(
    `npx --yes neonctl@latest connection-string ${t.branchId} --project-id ${t.projectId} --org-id ${t.orgId} --database-name ${t.database} --role-name ${t.role}`,
    { shell: true, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
  return r.status === 0 ? r.stdout.trim() : "";
}
const url = process.env[URL_ENV_VAR]?.trim() || (viaNeon ? neonUrl() : "");
if (!url) {
  refuse(`No integration database URL. Set ${URL_ENV_VAR} to the DIRECT (non-pooler) URL of ${AUTHORIZED_TARGET.database}, or pass --neon to fetch it through the authenticated neonctl. (DATABASE_URL is intentionally ignored.)`);
}

// 3. ask the SERVER who it is (read-only transaction), then decide
const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20_000 });
let identity = null;
let migrations = null;
try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const one = async (sql) => (await client.query(sql)).rows[0]?.v ?? null;
  identity = {
    projectId: await one("select current_setting('neon.project_id', true) v"),
    branchId: await one("select current_setting('neon.branch_id', true) v"),
    database: await one("select current_database() v"),
  };
  try {
    migrations = (await client.query("select migration_name, finished_at, rolled_back_at from public._prisma_migrations")).rows;
  } catch {
    migrations = null;
  }
  await client.query("ROLLBACK");
} catch (e) {
  refuse(`Could not verify the target database: ${redact(e.message)}`);
} finally {
  await client.end().catch(() => undefined);
}

const repoMigrations = readdirSync(path.join(REPO, "prisma", "migrations"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
const verdict = evaluateTarget({ url, identity, migrations, repoMigrations });
out(`[integration] target identity: project=${identity.projectId} branch=${identity.branchId} database=${identity.database}`);
out(`[integration] migrations: ${migrations?.length ?? "unreadable"} applied / ${repoMigrations.length} in repository`);
if (!verdict.ok) {
  refuse("Safety checks failed:\n" + verdict.failures.map((f) => `  - ${f.code}: ${f.detail}`).join("\n"));
}
out("[integration] all safety gates passed.");

// 4. minimal child environment, re-checked before spawning
const env = buildChildEnv(process.env, url);
const leaked = findForbiddenChildEnv(env);
if (leaked.length) refuse(`Internal error: forbidden variables in child environment: ${leaked.join(", ")}`);
out(`[integration] child environment variables: ${Object.keys(env).sort().join(", ")}`);
out("[integration] providers (Stripe, Twilio, Resend, Pusher, Telegram, Supabase…) are NOT available to the tests.");
out("[integration] WARNING: this suite writes test data and does not clean it up.");

if (dryRun) {
  out("[integration] --dry-run: stopping before the test process.");
  process.exit(0);
}

// 5. test files (no shell globbing) and the tsx test runner
const dir = path.join(REPO, "tests", "integration");
const all = readdirSync(dir).filter((f) => f.endsWith(".test.ts")).sort();
const files = (fileArgs.length ? fileArgs.map((f) => path.basename(f)) : all).map((f) => {
  if (!all.includes(f)) refuse(`Unknown integration test file: ${f}`);
  return path.join("tests", "integration", f);
});
const tsxCli = path.join(REPO, "node_modules", "tsx", "dist", "cli.mjs");
if (!existsSync(tsxCli)) refuse("tsx is not installed (run npm install).");

const child = spawn(process.execPath, [tsxCli, "--test", "--test-concurrency=1", ...extraNodeArgs, ...files], {
  cwd: REPO,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (d) => process.stdout.write(redact(d.toString())));
child.stderr.on("data", (d) => process.stderr.write(redact(d.toString())));
child.on("close", (code) => process.exit(code ?? 1));
