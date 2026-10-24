/* eslint-disable @typescript-eslint/no-explicit-any -- loose fakes on purpose */
// Pre-approval validation of signup attribution against a REAL scratch PostgreSQL (gate: see docs/testing.md).
// Covers: flag-off writes AND queries nothing, byte-for-byte identical Shop/User/Subscription rows with the flag off vs on (EN + FR),
// Google sign-up unchanged, failure modes against a really missing table, payload-free logs, and the shopId UNIQUE constraint under concurrency.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Signup attribution validation database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00"; process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret-00";
  process.env.NEXT_PUBLIC_APP_URL = "https://www.garage-os.ca";
  await import("./helpers/action-harness"); // stubs server-only etc. before app modules load
  const { db } = await import("../src/lib/db");
  const lib = await import("../src/lib/platform/signup-attribution");
  const { authConfig } = await import("../src/lib/auth");
  const { POST: signup } = await import("../src/app/api/auth/signup/route");

  const run = Date.now().toString(36);
  const FLAG = "ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED";
  let n = 0;
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    const base = { shopName: `Val Shop ${run}-${++n}`, name: "Owner Test", email: `v-${run}-${n}@val.test`, password: "password-123", locale: "en" };
    for (const [k, v] of Object.entries({ ...base, ...fields })) fd.set(k, v);
    return new Request("https://www.garage-os.ca/api/auth/signup", { method: "POST", body: fd, headers: { "x-real-ip": `198.51.100.${(n % 250) + 1}` } }) as never;
  };
  const HANDOFF_EN = { ho_from: "commercial:pricing", ho_lang: "en", ho_lp: "/pricing", ho_cta: "signup_start", ho_utm_source: "newsletter", ho_utm_medium: "email", ho_utm_campaign: "launch", ho_ref: "l.facebook.com" };
  const HANDOFF_FR = { ho_from: "commercial:demo", ho_lang: "fr", ho_lp: "/fr/demo", ho_cta: "signup_start", ho_utm_source: "newsletter", ho_utm_medium: "email", ho_utm_campaign: "lancement", ho_ref: "l.facebook.com" };

  const capture = async <T>(fn: () => Promise<T>) => {
    const logs: string[] = [];
    const orig = { e: console.error, l: console.log, w: console.warn, i: console.info };
    const sink = (...a: unknown[]) => void logs.push(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(" "));
    console.error = sink; console.log = sink; console.warn = sink; console.info = sink;
    try { return { result: await fn(), logs }; } finally { console.error = orig.e; console.log = orig.l; console.warn = orig.w; console.info = orig.i; }
  };
  const attrLogs = (logs: string[]) => logs.filter((l) => l.includes("[signup-attribution]"));

  /** Rows a signup creates, with ids / timestamps / unique values scrubbed so two signups can be compared byte for byte. */
  const snapshot = async (email: string, shopName: string) => {
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const shop = await db.shop.findUniqueOrThrow({ where: { id: user.shopId! } });
    const subs = await db.subscription.findMany({ where: { shopId: shop.id } });
    const scrub = (row: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (["id", "shopId", "createdAt", "updatedAt", "slug", "emailVerifyToken"].includes(k)) { out[k] = v == null ? v : "<scrubbed>"; continue; }
        if (v instanceof Date) { out[k] = "<date>"; continue; }
        if (typeof v === "string") { out[k] = v.split(email).join("<email>").split(shopName).join("<shop>"); continue; }
        out[k] = v;
      }
      return out;
    };
    const { passwordHash, ...userRest } = user as any;
    assert.ok(passwordHash && passwordHash.startsWith("$2"), "bcrypt hash stored");
    return { shop: scrub(shop as any), user: scrub({ ...userRest, passwordHash: "<bcrypt>" }), subscriptions: subs.map((s) => scrub(s as any)) };
  };
  const redirectShape = (res: Response, email: string) => `${res.status} ${(res.headers.get("location") ?? "").split(encodeURIComponent(email)).join("<email>").split(email).join("<email>")}`;

  test("flag OFF: the signup route neither writes NOR QUERIES the attribution table (proved with the table really missing)", async () => {
    delete process.env[FLAG];
    const calls: string[] = [];
    const model: any = db.signupAttribution;
    const originals: Record<string, any> = {};
    for (const k of Object.keys(model)) if (typeof model[k] === "function") { originals[k] = model[k]; model[k] = (...a: unknown[]) => { calls.push(k); return originals[k].apply(model, a); }; }
    await db.$executeRawUnsafe('ALTER TABLE garageos."SignupAttribution" RENAME TO "SignupAttribution_gone"');
    try {
      const email = `off-nq-${run}@val.test`;
      const { result: res, logs } = await capture(() => signup(form({ email, ...HANDOFF_EN })) as Promise<Response>);
      assert.equal(res.status, 303);
      assert.match(res.headers.get("location") ?? "", /verify-email-sent/);
      assert.deepEqual(calls, [], "no Prisma method of the attribution model was called");
      assert.deepEqual(attrLogs(logs), [], "a query against the missing table would have logged an error: none did");
      assert.ok(await db.user.findUnique({ where: { email } }), "shop/user created");
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE garageos."SignupAttribution_gone" RENAME TO "SignupAttribution"');
      for (const k of Object.keys(originals)) model[k] = originals[k];
    }
  });

  test("flag ON + DNT or GPC: nothing written even with a valid hand-off", async () => {
    process.env[FLAG] = "true";
    try {
      for (const hdr of [{ dnt: "1" }, { "sec-gpc": "1" }] as Record<string, string>[]) {
        const email = `optout-${Object.keys(hdr)[0]}-${run}@val.test`;
        const r = form({ email, ...HANDOFF_EN }) as unknown as Request;
        const req = new Request(r.url, { method: "POST", body: await r.formData(), headers: { ...hdr, "x-real-ip": "198.51.100.77" } });
        const res: Response = await signup(req as never);
        assert.equal(res.status, 303);
        const u = await db.user.findUniqueOrThrow({ where: { email } });
        assert.equal(await db.signupAttribution.count({ where: { shopId: u.shopId! } }), 0);
      }
    } finally { delete process.env[FLAG]; }
  });

  for (const [lang, handoff] of [["en", HANDOFF_EN], ["fr", HANDOFF_FR]] as const) {
    test(`regression (${lang}): Shop/User/Subscription rows and response are identical with the flag OFF and ON; only the attribution row differs`, async () => {
      const mk = (tag: string) => ({ email: `reg-${lang}-${tag}-${run}@val.test`, shopName: `Reg ${lang} ${tag} ${run}` });
      const off = mk("off"); const on = mk("on");
      delete process.env[FLAG];
      const resOff: Response = await signup(form({ ...off, locale: lang, ...handoff }));
      process.env[FLAG] = "true";
      let resOn: Response;
      try { resOn = await signup(form({ ...on, locale: lang, ...handoff })); } finally { delete process.env[FLAG]; }
      assert.equal(redirectShape(resOn, on.email), redirectShape(resOff, off.email), "same response");
      assert.match(resOn.headers.get("location") ?? "", /verify-email-sent/);
      const a = await snapshot(off.email, off.shopName);
      const b = await snapshot(on.email, on.shopName);
      assert.deepEqual(b, a, "scrubbed Shop, User and Subscription rows are identical");
      assert.equal(a.subscriptions.length, 1);
      assert.equal((a.subscriptions[0] as any).status, "AWAITING_PLAN", "no trial / Stripe state is created at signup");
      assert.equal((a.subscriptions[0] as any).plan, null);
      assert.equal((a.subscriptions[0] as any).stripeCustomerId ?? null, null);
      const offShop = (await db.user.findUniqueOrThrow({ where: { email: off.email } })).shopId!;
      const onShop = (await db.user.findUniqueOrThrow({ where: { email: on.email } })).shopId!;
      assert.equal(await db.signupAttribution.count({ where: { shopId: offShop } }), 0, "flag off: no attribution row");
      const row = await db.signupAttribution.findUniqueOrThrow({ where: { shopId: onShop } });
      assert.equal(row.locale, lang);
      assert.equal(row.channel, "email");
    });
  }

  test("Google sign-up (src/lib/auth.ts signIn callback) is a separate path: works unchanged with the flag on, no attribution, no error", async () => {
    process.env[FLAG] = "true";
    try {
      const email = `google-${run}@val.test`;
      const signIn = authConfig.callbacks!.signIn!;
      const { result, logs } = await capture(async () => signIn({ user: { email, name: "Gina Google" }, account: { provider: "google" } } as never));
      assert.equal(result, true);
      assert.deepEqual(attrLogs(logs), []);
      const u = await db.user.findUniqueOrThrow({ where: { email } });
      assert.equal(u.role, "OWNER");
      assert.ok(u.emailVerified, "Google confirmed the email");
      const sub = await db.subscription.findFirstOrThrow({ where: { shopId: u.shopId! } });
      assert.equal(sub.status, "AWAITING_PLAN");
      assert.equal(await db.signupAttribution.count({ where: { shopId: u.shopId! } }), 0, "Google sign-up is not attributed (documented follow-up)");
      // returning Google user: still fine
      assert.equal(await signIn({ user: { email, name: "Gina Google" }, account: { provider: "google" } } as never), true);
    } finally { delete process.env[FLAG]; }
  });

  test("a REALLY missing table never fails the signup; the log has the error class only, no landingPath/utm/referrer/IP/email", async () => {
    process.env[FLAG] = "true";
    await db.$executeRawUnsafe('ALTER TABLE garageos."SignupAttribution" RENAME TO "SignupAttribution_gone"');
    try {
      const email = `missing-${run}@val.test`;
      const { result: res, logs } = await capture(() => signup(form({ email, ...HANDOFF_EN, ho_lp: "/pricing", ho_utm_campaign: "secretcampaign" })) as Promise<Response>);
      assert.equal(res.status, 303);
      assert.match(res.headers.get("location") ?? "", /verify-email-sent/, "same redirect as a normal signup");
      const u = await db.user.findUniqueOrThrow({ where: { email } });
      assert.equal((await db.subscription.findFirstOrThrow({ where: { shopId: u.shopId! } })).status, "AWAITING_PLAN");
      const mine = attrLogs(logs);
      assert.equal(mine.length, 1, "exactly one attribution log line");
      assert.match(mine[0], /^\[signup-attribution\] not recorded: \w+$/);
      for (const l of logs) for (const secret of ["/pricing", "newsletter", "secretcampaign", "l.facebook.com", "198.51.100", email]) assert.ok(!l.includes(secret), `no "${secret}" in any log line (incl. Prisma's own error log)`);
    } finally { await db.$executeRawUnsafe('ALTER TABLE garageos."SignupAttribution_gone" RENAME TO "SignupAttribution"'); delete process.env[FLAG]; }
  });

  test("a real DB error (FK violation) is logged without payload and returns false", async () => {
    process.env[FLAG] = "true";
    try {
      const { result, logs } = await capture(() => lib.captureSignupAttribution({ shopId: "no-such-shop", fields: { from: "commercial:pricing", lp: "/pricing", utm_source: "newsletter" }, referrerHost: "l.facebook.com", headers: new Headers({ "x-real-ip": "203.0.113.9" }) }));
      assert.equal(result, false);
      const mine = attrLogs(logs);
      assert.equal(mine.length, 1);
      assert.match(mine[0], /^\[signup-attribution\] not recorded: \w+$/);
      // Prisma's own built-in error log (log: ["error"]) is captured here too: a source code frame and the constraint name, never the payload values.
      for (const l of logs) for (const secret of ["no-such-shop", "/pricing", "newsletter", "facebook", "203.0.113.9", "commercial:pricing"]) assert.ok(!l.includes(secret), `no "${secret}" in any log line`);
    } finally { delete process.env[FLAG]; }
  });

  test("double submit / retry / replay: one row, first touch wins; the second submit is the normal 'email taken' redirect", async () => {
    process.env[FLAG] = "true";
    try {
      const email = `dbl-${run}@val.test`;
      const fields = { email, shopName: `Dbl ${run}` };
      const r1: Response = await signup(form({ ...fields, ...HANDOFF_EN }));
      const r2: Response = await signup(form({ ...fields, ...HANDOFF_FR, ho_utm_source: "other" }));
      assert.match(r1.headers.get("location") ?? "", /verify-email-sent/);
      assert.doesNotMatch(r2.headers.get("location") ?? "", /verify-email-sent/);
      const u = await db.user.findUniqueOrThrow({ where: { email } });
      assert.equal(await db.user.count({ where: { email } }), 1);
      const rows = await db.signupAttribution.findMany({ where: { shopId: u.shopId! } });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].utmSource, "newsletter", "first touch kept");
      // replay of the capture itself (e.g. a re-run after email verification) is a no-op
      assert.equal(await lib.captureSignupAttribution({ shopId: u.shopId!, fields: { from: "blog:x", utm_source: "late" }, headers: new Headers() }, { [FLAG]: "true" } as never), false);
      assert.equal((await db.signupAttribution.findUniqueOrThrow({ where: { shopId: u.shopId! } })).utmSource, "newsletter");
    } finally { delete process.env[FLAG]; }
  });

  test("shopId UNIQUE: concurrent plain inserts for one shop -> exactly one wins, the rest fail with P2002", async () => {
    const shop = await db.shop.create({ data: { name: `Uniq ${run}` } });
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => db.signupAttribution.create({ data: { shopId: shop.id, utmSource: `s${i}` } })));
    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(bad.length, 7);
    for (const b of bad) assert.equal((b.reason as any).code, "P2002");
    assert.equal(await db.signupAttribution.count({ where: { shopId: shop.id } }), 1);
    const idx: any[] = await db.$queryRawUnsafe(`select indexdef from pg_indexes where schemaname='garageos' and tablename='SignupAttribution' and indexname='SignupAttribution_shopId_key'`);
    assert.match(idx[0].indexdef, /CREATE UNIQUE INDEX/);
  });

  test("cleanup", async () => { await db.$disconnect(); });
}
