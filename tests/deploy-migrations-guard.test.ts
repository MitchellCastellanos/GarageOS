import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";

// Ejecuta el script real con una BD inexistente y un `npx` falso: si tocara Prisma fallaría o llamaría al stub.
function run(env: Record<string, string>) {
  return spawnSync(process.execPath, ["scripts/deploy-migrations.mjs"], {
    env: { PATH: "/nonexistent-bin", DATABASE_URL: "postgres://u:p@invalid.example:5432/db", ...env } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
}

test("Preview build skips migrations/backfill/super-admin entirely", () => {
  const r = run({ VERCEL_ENV: "preview" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /VERCEL_ENV=preview — skipping migrations/);
  assert.doesNotMatch(r.stdout, /Applying pending Prisma migrations/);
});

test("development env is skipped too; explicit Preview opt-in reaches the migration step", () => {
  assert.match(run({ VERCEL_ENV: "development" }).stdout, /skipping migrations/);
  // Con opt-in intenta correr Prisma (npx no existe en este PATH → falla el build, prueba de que no se saltó).
  const r = run({ VERCEL_ENV: "preview", RUN_DB_STEPS_ON_PREVIEW: "1" });
  assert.match(r.stdout, /Applying pending Prisma migrations/);
  assert.notEqual(r.status, 0);
});

test("production and local (no VERCEL_ENV) still run the DB steps", () => {
  assert.match(run({ VERCEL_ENV: "production" }).stdout, /Applying pending Prisma migrations/);
  assert.match(run({}).stdout, /Applying pending Prisma migrations/);
});

test("no database configured: skip (unchanged behaviour)", () => {
  const r = spawnSync(process.execPath, ["scripts/deploy-migrations.mjs"], { env: { PATH: "/nonexistent-bin", VERCEL_ENV: "production" } as unknown as NodeJS.ProcessEnv, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No DIRECT_URL\/DATABASE_URL set/);
});
