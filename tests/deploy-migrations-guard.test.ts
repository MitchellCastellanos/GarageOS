import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { PRODUCTION_ENDPOINT_IDS, decideDbSteps, endpointId } from "../scripts/lib/deploy-guard.mjs";

// Synthetic, dead database targets only — nothing here can reach a real database.
const PW = "s3cr3t-pw";
const DEAD = `postgres://u:${PW}@invalid.example:5432/db`;
const PREVIEW_POOLED = `postgres://u:${PW}@ep-preview-abc-pooler.c-2.us-east-2.aws.neon.tech/db`;
const PREVIEW_DIRECT = `postgres://u:${PW}@ep-preview-abc.c-2.us-east-2.aws.neon.tech/db`;
const OTHER_DIRECT = `postgres://u:${PW}@ep-other-xyz.c-2.us-east-2.aws.neon.tech/db`;
const PROD = `postgres://u:${PW}@${PRODUCTION_ENDPOINT_IDS[0]}.c-2.us-east-2.aws.neon.tech/db`;

// Runs the REAL script with a PATH that has no `npx`: if it ever got past the guard it would fail at the
// migration step (or call the stub) instead of touching Prisma or a database.
function run(env: Record<string, string>) {
  return spawnSync(process.execPath, ["scripts/deploy-migrations.mjs"], {
    env: { PATH: "/nonexistent-bin", DATABASE_URL: DEAD, ...env } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
}
const out = (r: { stdout: string; stderr: string }) => r.stdout + r.stderr;
const reachedMigrations = (r: { stdout: string }) => /Applying pending Prisma migrations/.test(r.stdout);

// ── decision logic ──────────────────────────────────────────────────────────────────────────────
test("endpointId: first host label without the Neon pooler suffix", () => {
  assert.equal(endpointId(PREVIEW_POOLED), "ep-preview-abc");
  assert.equal(endpointId(PREVIEW_DIRECT), "ep-preview-abc");
  assert.equal(endpointId("not a url"), null);
});

test("Vercel Production is the only environment that runs the DB steps automatically", () => {
  const d = decideDbSteps({ VERCEL: "1", VERCEL_ENV: "production", DATABASE_URL: PROD });
  assert.equal(d.run, true);
  assert.equal(d.code, "VERCEL_PRODUCTION");
  // DIRECT_URL + pooled DATABASE_URL on the same endpoint is fine
  assert.equal(decideDbSteps({ VERCEL: "1", VERCEL_ENV: "production", DIRECT_URL: PREVIEW_DIRECT, DATABASE_URL: PREVIEW_POOLED }).run, true);
});

test("VERCEL_ENV=production outside Vercel (VERCEL!=1) is refused, not honored", () => {
  const d = decideDbSteps({ VERCEL_ENV: "production", DATABASE_URL: PROD });
  assert.equal(d.run, false);
  assert.equal(d.exitCode, 1);
  assert.equal(d.code, "PRODUCTION_OUTSIDE_VERCEL");
});

test("Preview and Development are skipped by default, with or without DIRECT_URL", () => {
  for (const env of ["preview", "development", "something-else"]) {
    const d = decideDbSteps({ VERCEL: "1", VERCEL_ENV: env, DATABASE_URL: PREVIEW_POOLED });
    assert.deepEqual([d.run, d.exitCode, d.code], [false, 0, "SKIP_NON_PRODUCTION"]);
  }
  const withDirect = decideDbSteps({ VERCEL: "1", VERCEL_ENV: "preview", DIRECT_URL: PREVIEW_DIRECT, DATABASE_URL: PREVIEW_POOLED });
  assert.deepEqual([withDirect.run, withDirect.code], [false, "SKIP_NON_PRODUCTION"], "a Preview DIRECT_URL does not bypass the guard");
  assert.equal(decideDbSteps({ VERCEL: "1", VERCEL_ENV: "preview", RUN_DB_STEPS_ON_PREVIEW: "true", DATABASE_URL: PREVIEW_POOLED }).run, false, "only the exact value 1 opts in");
});

test("Preview opt-in works for a dedicated database but never for a Production endpoint or mismatched URLs", () => {
  assert.equal(decideDbSteps({ VERCEL: "1", VERCEL_ENV: "preview", RUN_DB_STEPS_ON_PREVIEW: "1", DATABASE_URL: PREVIEW_POOLED, DIRECT_URL: PREVIEW_DIRECT }).run, true);
  const prod = decideDbSteps({ VERCEL: "1", VERCEL_ENV: "preview", RUN_DB_STEPS_ON_PREVIEW: "1", DATABASE_URL: PROD });
  assert.deepEqual([prod.run, prod.exitCode, prod.code], [false, 1, "NON_PRODUCTION_TARGETS_PRODUCTION"]);
  const mixed = decideDbSteps({ VERCEL: "1", VERCEL_ENV: "preview", RUN_DB_STEPS_ON_PREVIEW: "1", DIRECT_URL: PREVIEW_DIRECT, DATABASE_URL: PROD });
  assert.deepEqual([mixed.run, mixed.code], [false, "ENDPOINT_MISMATCH"], "migrate on preview + backfill on production is impossible");
});

test("no VERCEL_ENV (local/CI) skips by default — even with DATABASE_URL / DIRECT_URL present", () => {
  for (const env of [{}, { DATABASE_URL: DEAD }, { DATABASE_URL: PROD }, { DIRECT_URL: PROD, DATABASE_URL: PROD }, { VERCEL: "1" }]) {
    const d = decideDbSteps(env);
    assert.deepEqual([d.run, d.exitCode, d.code], [false, 0, "SKIP_LOCAL"], JSON.stringify(Object.keys(env)));
  }
});

test("manual local run needs an explicit opt-in AND a matching, non-Production target endpoint", () => {
  const base = { DEPLOY_MIGRATIONS_ALLOW_LOCAL: "1" };
  assert.equal(decideDbSteps({ ...base }).code, "MANUAL_NO_URL");
  assert.equal(decideDbSteps({ ...base, DATABASE_URL: PREVIEW_DIRECT }).code, "MANUAL_TARGET_REQUIRED");
  assert.equal(decideDbSteps({ ...base, DATABASE_URL: PREVIEW_DIRECT, DEPLOY_MIGRATIONS_TARGET_ENDPOINT: "ep-other-xyz" }).code, "MANUAL_TARGET_MISMATCH");
  assert.equal(decideDbSteps({ DEPLOY_MIGRATIONS_TARGET_ENDPOINT: "ep-preview-abc", DATABASE_URL: PREVIEW_DIRECT }).code, "SKIP_LOCAL", "target alone is not an opt-in");
  assert.equal(decideDbSteps({ DEPLOY_MIGRATIONS_ALLOW_LOCAL: "yes", DATABASE_URL: PREVIEW_DIRECT, DEPLOY_MIGRATIONS_TARGET_ENDPOINT: "ep-preview-abc" }).code, "SKIP_LOCAL", "only the exact value 1 opts in");
  const ok = decideDbSteps({ ...base, DATABASE_URL: PREVIEW_DIRECT, DEPLOY_MIGRATIONS_TARGET_ENDPOINT: "ep-preview-abc" });
  assert.deepEqual([ok.run, ok.code], [true, "MANUAL_OPT_IN"]);
  // pooled + direct on the same endpoint is fine
  assert.equal(decideDbSteps({ ...base, DATABASE_URL: PREVIEW_POOLED, DIRECT_URL: PREVIEW_DIRECT, DEPLOY_MIGRATIONS_TARGET_ENDPOINT: "ep-preview-abc" }).run, true);
});

test("the opt-in alone can never authorize Production, even if the operator names it as the target", () => {
  const id = PRODUCTION_ENDPOINT_IDS[0];
  const d = decideDbSteps({ DEPLOY_MIGRATIONS_ALLOW_LOCAL: "1", DATABASE_URL: PROD, DEPLOY_MIGRATIONS_TARGET_ENDPOINT: id });
  assert.deepEqual([d.run, d.exitCode, d.code], [false, 1, "MANUAL_TARGETS_PRODUCTION"]);
  // a URL pointing at another database with Production named as target, or the reverse, is also refused
  assert.equal(decideDbSteps({ DEPLOY_MIGRATIONS_ALLOW_LOCAL: "1", DATABASE_URL: PREVIEW_DIRECT, DEPLOY_MIGRATIONS_TARGET_ENDPOINT: id }).run, false);
  assert.equal(decideDbSteps({ DEPLOY_MIGRATIONS_ALLOW_LOCAL: "1", DATABASE_URL: PROD, DIRECT_URL: PREVIEW_DIRECT, DEPLOY_MIGRATIONS_TARGET_ENDPOINT: "ep-preview-abc" }).run, false, "DIRECT_URL on preview, DATABASE_URL on production");
  assert.equal(decideDbSteps({ DEPLOY_MIGRATIONS_ALLOW_LOCAL: "1", DATABASE_URL: OTHER_DIRECT, DIRECT_URL: PREVIEW_DIRECT, DEPLOY_MIGRATIONS_TARGET_ENDPOINT: "ep-preview-abc" }).code, "ENDPOINT_MISMATCH");
});

// ── the real script ─────────────────────────────────────────────────────────────────────────────
test("script: Preview and Development builds skip every DB step", () => {
  for (const env of ["preview", "development"]) {
    const r = run({ VERCEL: "1", VERCEL_ENV: env });
    assert.equal(r.status, 0);
    assert.match(r.stdout, new RegExp(`VERCEL_ENV=${env} — skipping migrations, backfill and super-admin bootstrap`));
    assert.ok(!reachedMigrations(r));
    assert.doesNotMatch(out(r), /Backfilling|Bootstrapping/);
  }
});

test("script: Preview DIRECT_URL presence does not bypass the guard", () => {
  const r = run({ VERCEL: "1", VERCEL_ENV: "preview", DIRECT_URL: PREVIEW_DIRECT, DATABASE_URL: PREVIEW_POOLED });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /skipping migrations/);
  assert.ok(!reachedMigrations(r));
});

test("script: no VERCEL_ENV skips by default even though DATABASE_URL is set", () => {
  const r = run({});
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No VERCEL_ENV \(local\/CI run\) — skipping migrations/);
  assert.ok(!reachedMigrations(r));
  const prod = run({ DATABASE_URL: PROD, DIRECT_URL: PROD });
  assert.equal(prod.status, 0);
  assert.ok(!reachedMigrations(prod));
});

test("script: Vercel Production and an explicit, matching manual opt-in reach the migration step; explicit Preview opt-in too", () => {
  const prod = run({ VERCEL: "1", VERCEL_ENV: "production" });
  assert.ok(reachedMigrations(prod), "Production reaches prisma migrate deploy");
  assert.notEqual(prod.status, 0, "npx is absent in this PATH, proving it was not skipped");
  const manual = run({ DEPLOY_MIGRATIONS_ALLOW_LOCAL: "1", DEPLOY_MIGRATIONS_TARGET_ENDPOINT: "invalid", DATABASE_URL: DEAD });
  assert.ok(reachedMigrations(manual));
  const preview = run({ VERCEL: "1", VERCEL_ENV: "preview", RUN_DB_STEPS_ON_PREVIEW: "1" });
  assert.ok(reachedMigrations(preview));
});

test("script: unsafe requests are refused with a non-zero exit before any DB step", () => {
  const cases: Record<string, string>[] = [
    { VERCEL_ENV: "production" }, // Production claimed outside Vercel
    { DEPLOY_MIGRATIONS_ALLOW_LOCAL: "1", DATABASE_URL: PROD, DEPLOY_MIGRATIONS_TARGET_ENDPOINT: PRODUCTION_ENDPOINT_IDS[0] },
    { DEPLOY_MIGRATIONS_ALLOW_LOCAL: "1", DATABASE_URL: DEAD }, // no target named
    { VERCEL: "1", VERCEL_ENV: "preview", RUN_DB_STEPS_ON_PREVIEW: "1", DATABASE_URL: PROD },
    { VERCEL: "1", VERCEL_ENV: "production", DIRECT_URL: PREVIEW_DIRECT, DATABASE_URL: OTHER_DIRECT },
  ];
  for (const env of cases) {
    const r = run(env);
    assert.equal(r.status, 1, JSON.stringify(Object.keys(env)));
    assert.ok(!reachedMigrations(r));
    assert.doesNotMatch(out(r), /Backfilling|Bootstrapping|Migrations applied/);
  }
});

test("script: no database configured on Production still skips without failing the build", () => {
  const r = spawnSync(process.execPath, ["scripts/deploy-migrations.mjs"], {
    env: { PATH: "/nonexistent-bin", VERCEL: "1", VERCEL_ENV: "production" } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No DIRECT_URL\/DATABASE_URL set/);
});

test("script: credentials never appear in logs, in any mode", () => {
  const envs: Record<string, string>[] = [
    { VERCEL: "1", VERCEL_ENV: "preview" },
    { VERCEL: "1", VERCEL_ENV: "production", DATABASE_URL: PREVIEW_POOLED, DIRECT_URL: PREVIEW_DIRECT },
    {},
    { DEPLOY_MIGRATIONS_ALLOW_LOCAL: "1", DATABASE_URL: PROD, DEPLOY_MIGRATIONS_TARGET_ENDPOINT: PRODUCTION_ENDPOINT_IDS[0] },
    { VERCEL_ENV: "production", DATABASE_URL: PROD },
    { VERCEL: "1", VERCEL_ENV: "production", DIRECT_URL: PREVIEW_DIRECT, DATABASE_URL: OTHER_DIRECT },
  ];
  for (const env of envs) {
    const text = out(run(env));
    assert.ok(!text.includes(PW), "password must not be logged");
    assert.doesNotMatch(text, /postgres(ql)?:\/\//, "no connection string must be logged");
  }
});

// ── structure of the script ─────────────────────────────────────────────────────────────────────
test("script structure: legacy resolves are gone; deploy, then backfill, then bootstrap remain in order", () => {
  const src = readFileSync("scripts/deploy-migrations.mjs", "utf8").replace(/\r\n/g, "\n");
  assert.doesNotMatch(src, /migrate["',\s]+resolve|"resolve"|--rolled-back|--applied/, "no migrate resolve of any kind");
  assert.doesNotMatch(src, /20260919120000_repair_shop_billing_email|20260926100000_add_appointment_events/);
  const deploy = src.indexOf('"migrate", "deploy"');
  const backfill = src.indexOf("backfill-sender-identities.ts");
  const bootstrap = src.indexOf("bootstrap-super-admin.ts");
  assert.ok(deploy > 0 && backfill > deploy && bootstrap > backfill, "migrate deploy < backfill < bootstrap");
  assert.match(src, /decideDbSteps\(process\.env\)/, "the gate is consulted before any step");
  assert.ok(src.indexOf("decideDbSteps(process.env)") < deploy, "the gate runs before migrate deploy");
});
