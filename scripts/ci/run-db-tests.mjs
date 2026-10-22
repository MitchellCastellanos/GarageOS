// Runs every `tests/*-db.test.ts` suite, each against its OWN fresh copy of a migrated scratch database.
//
// Why: the suites share global state (pools, queues, "latest version" rows, counters). Run together in one database
// they interfere with each other (docs/testing.md); each passes in a clean database. A PostgreSQL TEMPLATE copy makes
// "one fresh database per suite" cost a fraction of a second.
//
// Prerequisite: GARAGEOS_CRM_TEST_DB_URL points at a local scratch database (name contains replay|test|scratch) on
// which `prisma migrate deploy` has already been applied. That database is only the template and is never written to.
// Needs the `psql` client on PATH. The password (if any) is passed to psql through PGPASSWORD, never printed.
//
// Usage: node scripts/ci/run-db-tests.mjs [--log <file>] [suite-name-substring ...]
import { spawnSync, spawn } from "node:child_process";
import { readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { checkScratchUrl, suiteDatabaseName } from "../lib/scratch-db-guard.mjs";

const args = process.argv.slice(2);
const logIdx = args.indexOf("--log");
const logFile = logIdx >= 0 ? args.splice(logIdx, 2)[1] : null;
const filters = args;

const guard = checkScratchUrl(process.env.GARAGEOS_CRM_TEST_DB_URL);
if (!guard.ok) {
  console.error(`[run-db-tests] REFUSING to run: ${guard.reason}`);
  process.exit(1);
}
const base = guard.url;
const template = guard.database;
const pgEnv = { ...process.env, PGPASSWORD: decodeURIComponent(base.password) };
const conn = ["-h", base.hostname, "-p", base.port || "5432", "-U", decodeURIComponent(base.username), "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"];
const psql = (sql) => spawnSync("psql", [...conn, "-c", sql], { env: pgEnv, encoding: "utf8" });

const suites = readdirSync("tests").filter((f) => f.endsWith("-db.test.ts")).sort()
  .filter((f) => filters.length === 0 || filters.some((x) => f.includes(x)));
if (suites.length === 0) { console.error("[run-db-tests] no suite matched"); process.exit(1); }
if (logFile) writeFileSync(logFile, "");

// Provider secrets never reach the suites; NEXTAUTH_URL must be unset (docs/testing.md).
const childEnvBase = { ...process.env };
for (const k of Object.keys(childEnvBase)) {
  if (/^(STRIPE_|TWILIO_|RESEND_|EMAIL_|PUSHER_|TELEGRAM_|SUPABASE_|GOOGLE_|QBO_|NEON_|NEXTAUTH_URL$|PLATFORM_ADMIN)/.test(k)) delete childEnvBase[k];
}

const runOne = (file, url) => new Promise((resolve) => {
  const child = spawn("npx", ["tsx", "--test", `tests/${file}`], { env: { ...childEnvBase, GARAGEOS_CRM_TEST_DB_URL: url }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  child.on("close", (code) => resolve({ code, out }));
});
const count = (out, key) => Number((out.match(new RegExp(`^# ${key} (\\d+)`, "m")) || [])[1] ?? 0);

const rows = [];
for (const file of suites) {
  const dbName = suiteDatabaseName(template, file);
  const url = new URL(base);
  url.pathname = `/${dbName}`;
  const check = checkScratchUrl(url.toString());
  if (!check.ok) { console.error(`[run-db-tests] bad derived database name ${dbName}: ${check.reason}`); process.exit(1); }
  psql(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  const created = psql(`CREATE DATABASE "${dbName}" TEMPLATE "${template}"`);
  if (created.status !== 0) { console.error(`[run-db-tests] cannot create ${dbName} from template ${template}: ${created.stderr.trim()}`); process.exit(1); }
  const { code, out } = await runOne(file, url.toString());
  psql(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  const r = { file, code, pass: count(out, "pass"), fail: count(out, "fail"), skipped: count(out, "skipped") };
  rows.push(r);
  if (logFile) appendFileSync(logFile, `\n### ${file}\n${out}\n`);
  else if (code !== 0) console.log(out);
  console.log(`${code === 0 ? "PASS" : "FAIL"}  ${file}  pass=${r.pass} fail=${r.fail} skipped=${r.skipped}`);
}
const bad = rows.filter((r) => r.code !== 0 || r.fail > 0);
console.log(`\nsuites: ${rows.length}, failed: ${bad.length}, tests passed: ${rows.reduce((a, r) => a + r.pass, 0)}, skipped: ${rows.reduce((a, r) => a + r.skipped, 0)}`);
if (bad.length) { console.error("Failing suites: " + bad.map((r) => r.file).join(", ")); process.exit(1); }
