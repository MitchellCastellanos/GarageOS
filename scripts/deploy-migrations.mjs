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

// Bootstrap del super admin (PLATFORM_ADMIN_EMAIL/PASSWORD/NAME) — no-op si
// esas variables no están configuradas. Idempotente, no bloquea el deploy.
console.log("[deploy-migrations] Bootstrapping super admin...");
const bootstrapAdmin = spawnSync("npx", ["tsx", "scripts/bootstrap-super-admin.ts"], {
  stdio: "inherit",
  env: process.env,
});

if (bootstrapAdmin.status !== 0) {
  console.error(
    "[deploy-migrations] bootstrap-super-admin falló — continuando el deploy de todos modos."
  );
}
