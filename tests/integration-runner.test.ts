import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  AUTHORIZED_TARGET, DENIED_BRANCH_IDS, OPT_IN_FLAG, URL_ENV_VAR, VERIFIED_MARKER_ENV_VAR,
  buildChildEnv, checkOptIn, describeConnection, evaluateTarget, findForbiddenChildEnv, redact, requireVerifiedRunner,
} from "../scripts/lib/integration-guard.mjs";

// Safety rules of the real-database integration runner (scripts/run-integration.mjs). Pure logic — no database.
const T = AUTHORIZED_TARGET;
const goodUrl = `postgresql://user:secret@ep-some-endpoint.c-2.us-east-2.aws.neon.tech/${T.database}?sslmode=require`;
const goodIdentity = { projectId: T.projectId, branchId: T.branchId, database: T.database };
const repo = ["20260911204000_init_garageos", "20260912000000_add_shop_domain", "20260912020000_add_user_preferred_locale"];
const applied = (names = repo) => names.map((migration_name) => ({ migration_name, finished_at: new Date(), rolled_back_at: null }));
const evalWith = (over: Record<string, unknown> = {}) =>
  evaluateTarget({ url: goodUrl, identity: goodIdentity, migrations: applied(), repoMigrations: repo, ...over } as never);
const codes = (r: { failures: { code: string }[] }) => r.failures.map((f) => f.code);

test("the authorized target passes every gate", () => {
  const r = evalWith();
  assert.equal(r.ok, true, JSON.stringify(r.failures));
});

test("Production branch is rejected (denylist AND allowlist)", () => {
  const prod = DENIED_BRANCH_IDS[0];
  const r = evalWith({ identity: { ...goodIdentity, branchId: prod } });
  assert.equal(r.ok, false);
  assert.ok(codes(r).includes("PRODUCTION_BRANCH"));
  assert.ok(codes(r).includes("WRONG_BRANCH"));
});

test("wrong database, wrong project and wrong branch are each rejected", () => {
  assert.ok(codes(evalWith({ identity: { ...goodIdentity, database: "neondb" } })).includes("WRONG_DATABASE"));
  assert.ok(codes(evalWith({ identity: { ...goodIdentity, projectId: "some-other-project" } })).includes("WRONG_PROJECT"));
  assert.ok(codes(evalWith({ identity: { ...goodIdentity, branchId: "br-some-other-branch" } })).includes("WRONG_BRANCH"));
});

test("a URL naming another database is rejected even if the server reports the right one", () => {
  const r = evalWith({ url: goodUrl.replace(T.database, "neondb") });
  assert.ok(codes(r).includes("URL_DATABASE"));
});

test("unknown identity fails closed (non-Neon server, missing settings)", () => {
  const r = evalWith({ identity: { projectId: null, branchId: null, database: "garageos_replay" } });
  assert.equal(r.ok, false);
  assert.ok(codes(r).includes("IDENTITY_UNKNOWN_PROJECT"));
  assert.ok(codes(r).includes("IDENTITY_UNKNOWN_BRANCH"));
  assert.equal(evalWith({ identity: null }).ok, false);
});

test("pooled endpoints, non-Neon hosts and garbage URLs are rejected", () => {
  assert.ok(codes(evalWith({ url: goodUrl.replace("ep-some-endpoint", "ep-some-endpoint-pooler") })).includes("URL_POOLED"));
  assert.ok(codes(evalWith({ url: goodUrl.replace("aws.neon.tech", "example.com") })).includes("URL_NOT_NEON"));
  assert.ok(codes(evalWith({ url: "not a url" })).includes("URL_UNPARSABLE"));
  assert.ok(codes(evalWith({ url: undefined })).includes("URL_UNPARSABLE"));
});

test("unhealthy migration history is rejected: failed, rolled back, missing, unknown, duplicate, unreadable", () => {
  const failed = applied();
  failed[1] = { ...failed[1], finished_at: null as never };
  assert.ok(codes(evalWith({ migrations: failed })).includes("MIGRATION_FAILED_OR_ROLLED_BACK"));

  const rolled = applied();
  rolled[0] = { ...rolled[0], rolled_back_at: new Date() as never };
  assert.ok(codes(evalWith({ migrations: rolled })).includes("MIGRATION_FAILED_OR_ROLLED_BACK"));

  assert.ok(codes(evalWith({ migrations: applied(repo.slice(0, 2)) })).includes("MIGRATIONS_MISSING"));
  assert.ok(codes(evalWith({ migrations: applied([...repo, "20990101000000_not_in_repo"]) })).includes("MIGRATIONS_UNKNOWN"));
  assert.ok(codes(evalWith({ migrations: applied([...repo, repo[0]]) })).includes("MIGRATIONS_DUPLICATE"));
  assert.ok(codes(evalWith({ migrations: null })).includes("MIGRATIONS_UNREADABLE"));
  assert.ok(codes(evalWith({ repoMigrations: [] })).includes("REPO_MIGRATIONS_EMPTY"));
});

test("opt-in must be explicit: env var exactly '1' or the flag", () => {
  assert.equal(checkOptIn({}, []), false);
  assert.equal(checkOptIn({ GARAGEOS_INTEGRATION_DB: "true" }, []), false);
  assert.equal(checkOptIn({ GARAGEOS_INTEGRATION_DB: "0" }, []), false);
  assert.equal(checkOptIn({ GARAGEOS_INTEGRATION_DB: "1" }, []), true);
  assert.equal(checkOptIn({}, [OPT_IN_FLAG]), true);
});

test("provider and application secrets never reach the child environment, whatever the parent has", () => {
  const parent: Record<string, string> = {
    PATH: "/bin", SystemRoot: "C:\\Windows", TEMP: "/tmp",
    DATABASE_URL: "postgresql://prod-should-not-leak", DIRECT_URL: "postgresql://prod-should-not-leak",
    DATABASE_URL_POOLED: "x", STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x", STRIPE_PRICE_CORE_MONTHLY: "price_x",
    TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM_NUMBER: "+1", RESEND_API_KEY: "re_x", RESEND_WEBHOOK_SECRET: "w",
    EMAIL_FROM: "a@b.c", PUSHER_SECRET: "s", PUSHER_KEY: "k", NEXT_PUBLIC_PUSHER_KEY: "k", TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1",
    SUPABASE_SERVICE_ROLE_KEY: "x", NEXT_PUBLIC_SUPABASE_URL: "https://x", GOOGLE_CLIENT_SECRET: "g", CRON_SECRET: "c",
    PLATFORM_ADMIN_PASSWORD: "p", NEXTAUTH_SECRET: "n", QBO_CLIENT_SECRET: "q", INTEGRATIONS_ENCRYPTION_KEY: "k",
    VERCEL_ENV: "production", NEON_API_KEY: "napi_x", RUN_DB_STEPS_ON_PREVIEW: "1", PGPASSWORD: "x", GARAGEOS_INTEGRATION_VERIFIED_TARGET: "forged",
  };
  const env = buildChildEnv(parent, goodUrl);
  assert.deepEqual(findForbiddenChildEnv(env), []);
  assert.equal(env.DATABASE_URL, goodUrl, "DATABASE_URL is the verified URL, not the inherited one");
  assert.equal(env.PATH, "/bin");
  for (const k of Object.keys(parent).filter((k) => !["PATH", "SystemRoot", "TEMP", "DATABASE_URL", "GARAGEOS_INTEGRATION_VERIFIED_TARGET"].includes(k))) {
    assert.ok(!(k in env), `${k} must not be forwarded`);
  }
  assert.equal(env[VERIFIED_MARKER_ENV_VAR], `${T.projectId}/${T.branchId}/${T.database}`, "marker is set by the runner, never inherited");
  // the forbidden-name detector itself catches leakage if someone widens the allowlist
  assert.deepEqual(findForbiddenChildEnv({ STRIPE_SECRET_KEY: "x", PATH: "y", resend_api_key: "z" }).sort(), ["STRIPE_SECRET_KEY", "resend_api_key"].sort());
});

test("tests refuse real-DB mode unless the runner verified the target", () => {
  assert.equal(requireVerifiedRunner({}), false, "suite disabled: tests skip");
  assert.throws(() => requireVerifiedRunner({ GARAGEOS_INTEGRATION_DB: "1" }), /not verified/);
  assert.throws(() => requireVerifiedRunner({ GARAGEOS_INTEGRATION_DB: "1", GARAGEOS_INTEGRATION_VERIFIED_TARGET: "forged" }), /not verified/);
  const env = buildChildEnv({}, goodUrl);
  assert.equal(requireVerifiedRunner(env), true);
});

test("connection descriptions and redaction never expose secrets", () => {
  const d = describeConnection(goodUrl);
  assert.equal(d.database, T.database);
  assert.equal(d.pooled, false);
  assert.ok(!JSON.stringify(d).includes("secret"));
  const t = redact(`failed for ${goodUrl} and password=hunter2 and postgres://a:b@h/db`);
  assert.ok(!t.includes("secret") && !t.includes("hunter2") && !t.includes("a:b@h"));
});

// ── the real launcher process, end to end (every case refuses before any database or test is touched) ──
const runner = (env: Record<string, string>, args: string[] = []) =>
  spawnSync(process.execPath, ["scripts/run-integration.mjs", ...args], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env } as never,
    encoding: "utf8",
  });

test("launcher: no opt-in -> refused", () => {
  const r = runner({ [URL_ENV_VAR]: goodUrl });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /REFUSED/);
  assert.match(r.stderr, /Opt in explicitly/);
});

test("launcher: opted in but no integration URL -> refused; DATABASE_URL is ignored", () => {
  const r = runner({ GARAGEOS_INTEGRATION_DB: "1", DATABASE_URL: goodUrl });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No integration database URL/);
  assert.ok(!(r.stdout + r.stderr).includes("secret"));
});

test("launcher: unreachable / unverifiable target -> refused without leaking the URL", () => {
  const r = runner({ GARAGEOS_INTEGRATION_DB: "1", [URL_ENV_VAR]: `postgresql://user:topsecret@127.0.0.1:1/${T.database}` });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Could not verify the target database/);
  assert.ok(!(r.stdout + r.stderr).includes("topsecret"));
});

test("package.json: test:integration is a cross-platform node launcher (no POSIX env prefix, no shell glob)", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<string, string>;
  assert.equal(scripts["test:integration"], "node scripts/run-integration.mjs");
  assert.ok(!/^[A-Z_]+=/.test(scripts["test:integration"]));
});
