#!/usr/bin/env node
// Runs `prisma migrate deploy` as part of `npm run build` so every deploy
// applies pending migrations automatically — no more manual db:deploy step.
// Skips safely when there's no DB configured (local `next build` without a
// .env, CI checks) instead of failing the build.
import { spawnSync } from "node:child_process";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.log("[deploy-migrations] No DIRECT_URL/DATABASE_URL set — skipping prisma migrate deploy.");
  process.exit(0);
}

// One-time repair: 20260919120000_repair_shop_billing_email failed on
// production because its first version referenced "Shop" unqualified
// instead of "garageos"."Shop" (this datasource uses multiSchema). A failed
// migration blocks `migrate deploy` entirely (P3009) until resolved, and we
// have no direct DB credential outside this build to run `migrate resolve`
// by hand — so do it here. The ALTER never actually ran, so `--rolled-back`
// is correct; on any database where this migration never failed (fresh
// databases, other environments) the command just errors harmlessly and is
// ignored. Safe to delete this block once production is confirmed healthy.
spawnSync("npx", ["prisma", "migrate", "resolve", "--rolled-back", "20260919120000_repair_shop_billing_email"], {
  stdio: "inherit",
  env: process.env,
});

console.log("[deploy-migrations] Applying pending Prisma migrations...");
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  console.error("[deploy-migrations] prisma migrate deploy failed — aborting build.");
  process.exit(result.status ?? 1);
}

console.log("[deploy-migrations] Migrations applied successfully.");

// Backfill de SenderIdentity/CommunicationRoute (Communications Platform, Fase 1).
// Idempotente — no bloquea el deploy si falla (se puede reintentar en el próximo build).
console.log("[deploy-migrations] Backfilling sender identities...");
const backfill = spawnSync("npx", ["tsx", "scripts/backfill-sender-identities.ts"], {
  stdio: "inherit",
  env: process.env,
});

if (backfill.status !== 0) {
  console.error(
    "[deploy-migrations] backfill-sender-identities falló — continuando el deploy de todos modos."
  );
}
