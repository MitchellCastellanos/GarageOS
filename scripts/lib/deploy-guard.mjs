// Decides whether scripts/deploy-migrations.mjs may touch a database. PURE (no I/O, never prints URLs) so every
// rule is unit-tested in tests/deploy-migrations-guard.test.ts.
//
// Modes (fail closed — anything not explicitly allowed is skipped, and unsafe explicit requests are refused):
//  1. Vercel PRODUCTION build (VERCEL=1 + VERCEL_ENV=production): runs the DB steps. The two database URLs must
//     agree on the endpoint, because migrate uses DIRECT_URL||DATABASE_URL while the backfill/bootstrap use DATABASE_URL.
//  2. Vercel Preview/Development (VERCEL_ENV set to anything else): skipped, unless RUN_DB_STEPS_ON_PREVIEW=1 AND a
//     dedicated non-Production database is configured (a Production endpoint is refused).
//  3. No VERCEL_ENV (local machine, CI): skipped by default — a DATABASE_URL lying around (e.g. a developer's
//     production env file) is NOT authorization. Manual runs need BOTH DEPLOY_MIGRATIONS_ALLOW_LOCAL=1 and
//     DEPLOY_MIGRATIONS_TARGET_ENDPOINT=<the endpoint id you mean to migrate>; that id must match the URL(s) and must
//     not be a Production endpoint. Production migrations go through the Vercel Production deploy only.

/** Neon compute endpoints of Production. Never migratable from a non-Production context. */
export const PRODUCTION_ENDPOINT_IDS = Object.freeze(["ep-quiet-mode-aezxempo"]);

/** First DNS label of the host without Neon's "-pooler" suffix, or null when the URL is unusable. */
export function endpointId(url) {
  try {
    const host = new URL(url).hostname;
    return host ? host.split(".")[0].replace(/-pooler$/, "") : null;
  } catch {
    return null;
  }
}

const skip = (code, message) => ({ run: false, exitCode: 0, code, message });
const refuse = (code, message) => ({ run: false, exitCode: 1, code, message });
const allow = (code, message) => ({ run: true, exitCode: 0, code, message });

/** @returns {{run: boolean, exitCode: number, code: string, message: string}} */
export function decideDbSteps(env) {
  const vercelEnv = env.VERCEL_ENV || "";
  const onVercel = env.VERCEL === "1";
  const urls = [env.DIRECT_URL, env.DATABASE_URL].filter(Boolean);
  const ids = urls.map(endpointId);
  const hasUrl = urls.length > 0;
  const unusable = ids.some((i) => i === null);
  const consistent = new Set(ids).size <= 1;

  if (vercelEnv === "production") {
    if (!onVercel) {
      return refuse("PRODUCTION_OUTSIDE_VERCEL", "VERCEL_ENV=production is set but this is not a Vercel build (VERCEL!=1). Refusing: Production migrations run only from the Vercel Production deploy.");
    }
    if (hasUrl && (unusable || !consistent)) {
      return refuse("ENDPOINT_MISMATCH", "DIRECT_URL and DATABASE_URL do not point at the same database endpoint (or are unparsable). Refusing to run migrations/backfill/bootstrap.");
    }
    return allow("VERCEL_PRODUCTION", "Vercel Production build: DB steps enabled.");
  }

  if (vercelEnv) {
    if (env.RUN_DB_STEPS_ON_PREVIEW !== "1") {
      return skip("SKIP_NON_PRODUCTION", `VERCEL_ENV=${vercelEnv} — skipping migrations, backfill and super-admin bootstrap (set RUN_DB_STEPS_ON_PREVIEW=1 with a dedicated Preview database to enable).`);
    }
    if (hasUrl && (unusable || !consistent)) {
      return refuse("ENDPOINT_MISMATCH", "DIRECT_URL and DATABASE_URL do not point at the same database endpoint (or are unparsable). Refusing to run migrations/backfill/bootstrap.");
    }
    if (ids.some((i) => PRODUCTION_ENDPOINT_IDS.includes(i))) {
      return refuse("NON_PRODUCTION_TARGETS_PRODUCTION", `VERCEL_ENV=${vercelEnv} with RUN_DB_STEPS_ON_PREVIEW=1 points at a Production database endpoint. Refusing.`);
    }
    return allow("VERCEL_PREVIEW_OPT_IN", `VERCEL_ENV=${vercelEnv} with explicit RUN_DB_STEPS_ON_PREVIEW=1: DB steps enabled for the dedicated Preview database.`);
  }

  // No VERCEL_ENV: local machine or CI.
  if (env.DEPLOY_MIGRATIONS_ALLOW_LOCAL !== "1") {
    return skip("SKIP_LOCAL", "No VERCEL_ENV (local/CI run) — skipping migrations, backfill and super-admin bootstrap. A DATABASE_URL in the environment is not authorization. For a deliberate manual run set DEPLOY_MIGRATIONS_ALLOW_LOCAL=1 and DEPLOY_MIGRATIONS_TARGET_ENDPOINT=<endpoint id> (Production endpoints are refused).");
  }
  if (!hasUrl) return refuse("MANUAL_NO_URL", "DEPLOY_MIGRATIONS_ALLOW_LOCAL=1 but neither DIRECT_URL nor DATABASE_URL is set.");
  const target = (env.DEPLOY_MIGRATIONS_TARGET_ENDPOINT || "").trim();
  if (!target) return refuse("MANUAL_TARGET_REQUIRED", "Manual run requires DEPLOY_MIGRATIONS_TARGET_ENDPOINT=<the database endpoint id you intend to migrate>.");
  if (unusable || !consistent) {
    return refuse("ENDPOINT_MISMATCH", "DIRECT_URL and DATABASE_URL do not point at the same database endpoint (or are unparsable). Refusing to run migrations/backfill/bootstrap.");
  }
  if (PRODUCTION_ENDPOINT_IDS.includes(target) || ids.some((i) => PRODUCTION_ENDPOINT_IDS.includes(i))) {
    return refuse("MANUAL_TARGETS_PRODUCTION", "Manual runs may not target a Production database endpoint. Production migrations run only from the Vercel Production deploy.");
  }
  if (ids[0] !== target) {
    return refuse("MANUAL_TARGET_MISMATCH", "The database endpoint in DIRECT_URL/DATABASE_URL does not match DEPLOY_MIGRATIONS_TARGET_ENDPOINT.");
  }
  return allow("MANUAL_OPT_IN", "Manual run: DEPLOY_MIGRATIONS_ALLOW_LOCAL=1 and the target endpoint matches. DB steps enabled.");
}
