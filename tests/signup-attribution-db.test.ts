/* eslint-disable @typescript-eslint/no-explicit-any -- loose fakes on purpose */
// Signup attribution against a REAL scratch PostgreSQL (gate: see docs/testing.md). Includes the real signup route.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Signup attribution database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00"; process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret-00";
  process.env.NEXT_PUBLIC_APP_URL = "https://www.garage-os.ca";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const lib = await import("../src/lib/platform/signup-attribution");
  const { buildSignupAttribution } = await import("../src/lib/analytics/signup-attribution");
  const { POST: signup } = await import("../src/app/api/auth/signup/route");

  const run = Date.now().toString(36);
  const ON = { ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED: "true" } as unknown as NodeJS.ProcessEnv;
  const H = (extra: Record<string, string> = {}) => new Headers({ "user-agent": "Mozilla/5.0 Chrome/120", ...extra });
  const mkShop = (name: string) => db.shop.create({ data: { name: `${name} ${run}` } });
  let n = 0;
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    const base = { shopName: `Attr Shop ${run}-${++n}`, name: "Owner Test", email: `owner-${run}-${n}@attr.test`, password: "password-123", locale: "en" };
    for (const [k, v] of Object.entries({ ...base, ...fields })) fd.set(k, v);
    return new Request("https://www.garage-os.ca/api/auth/signup", { method: "POST", body: fd, headers: { "x-real-ip": `198.51.100.${n}` } }) as never;
  };
  const shopByEmail = async (email: string) => (await db.user.findUnique({ where: { email }, select: { shopId: true } }))?.shopId ?? null;

  test("create twice -> one row, first touch wins, never updated", async () => {
    const shop = await mkShop("Twice");
    const first = buildSignupAttribution({ from: "commercial:pricing", lang: "en", cta: "signup_start", utm_source: "google" }, { formLocale: "en" });
    const second = buildSignupAttribution({ from: "blog:post", lang: "fr", utm_source: "other" }, { formLocale: "fr" });
    assert.equal(await lib.insertSignupAttribution(db, shop.id, first), true);
    assert.equal(await lib.insertSignupAttribution(db, shop.id, second), false, "second insert is a no-op");
    assert.equal(await lib.captureSignupAttribution({ shopId: shop.id, fields: { from: "help:x" }, headers: H() }, ON), false, "capture on an attributed shop is a no-op too");
    const rows = await db.signupAttribution.findMany({ where: { shopId: shop.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].utmSource, "google");
    assert.equal(rows[0].pageType, "commercial");
    assert.equal(rows[0].ctaId, "signup_start");
    // concurrent double submit: still exactly one row
    const shop2 = await mkShop("Concurrent");
    const rec = buildSignupAttribution({ from: "home:landing" });
    await Promise.all([1, 2, 3, 4].map(() => lib.insertSignupAttribution(db, shop2.id, rec)));
    assert.equal(await db.signupAttribution.count({ where: { shopId: shop2.id } }), 1);
  });

  test("the flag is off by default and DNT/GPC are honoured: nothing is written", async () => {
    const shop = await mkShop("Flag");
    assert.equal(await lib.captureSignupAttribution({ shopId: shop.id, fields: { from: "home:x" }, headers: H() }, {} as unknown as NodeJS.ProcessEnv), false);
    assert.equal(await lib.captureSignupAttribution({ shopId: shop.id, fields: { from: "home:x" }, headers: H({ dnt: "1" }) }, ON), false);
    assert.equal(await lib.captureSignupAttribution({ shopId: shop.id, fields: { from: "home:x" }, headers: H({ "sec-gpc": "1" }) }, ON), false);
    assert.equal(await db.signupAttribution.count({ where: { shopId: shop.id } }), 0);
  });

  test("attribution failure never throws and does not touch the shop", async () => {
    const shop = await mkShop("Failing");
    const boom: any = { signupAttribution: { createMany: async () => { throw Object.assign(new Error("relation does not exist /secret/path 203.0.113.9"), { name: "PrismaClientKnownRequestError" }); } } };
    const logs: string[] = []; const orig = console.error; console.error = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
    try { assert.equal(await lib.captureSignupAttribution({ shopId: shop.id, fields: {}, headers: H() }, ON, boom), false); } finally { console.error = orig; }
    for (const l of logs) assert.ok(!l.includes("203.0.113.9") && !l.includes("/secret/path"), "no payload in the log");
    assert.ok(await db.shop.findUnique({ where: { id: shop.id } }), "shop still exists");
  });

  test("signup route: with the flag on, a hand-off creates the shop AND one attribution row", async () => {
    process.env.ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED = "true";
    try {
      const fields = { ho_from: "commercial:demo", ho_lang: "fr", ho_lp: "/fr/demo", ho_cta: "signup_start", ho_utm_source: "newsletter", ho_utm_medium: "email", ho_ref: "l.facebook.com", locale: "fr", email: `ok-${run}@attr.test` };
      const res: Response = await signup(form(fields));
      assert.equal(res.status, 303);
      assert.match(res.headers.get("location") ?? "", /verify-email-sent/);
      const shopId = await shopByEmail(fields.email);
      assert.ok(shopId, "shop and owner created");
      const a = await db.signupAttribution.findUnique({ where: { shopId: shopId! } });
      assert.ok(a);
      assert.deepEqual(
        { landingPath: a!.landingPath, locale: a!.locale, channel: a!.channel, pageType: a!.pageType, ctaId: a!.ctaId, utmSource: a!.utmSource, utmMedium: a!.utmMedium, utmCampaign: a!.utmCampaign, referrerHost: a!.referrerHost },
        { landingPath: "/fr/demo", locale: "fr", channel: "email", pageType: "commercial", ctaId: "signup_start", utmSource: "newsletter", utmMedium: "email", utmCampaign: "", referrerHost: "l.facebook.com" },
      );
      assert.ok(!JSON.stringify(a).includes(fields.email), "no email in the attribution row");
    } finally {
      delete process.env.ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED;
    }
  });

  test("signup route: invalid hand-off is ignored (direct first touch); signup succeeds", async () => {
    process.env.ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED = "true";
    try {
      const email = `bad-${run}@attr.test`;
      const res: Response = await signup(form({ email, ho_from: "evil:x", ho_lang: "es", ho_lp: "/portal/abcdefghijklmnopqrstuvwxyz012345", ho_cta: "buy_now", ho_utm_source: "me@x.com", ho_ref: "https://evil.example/p" }));
      assert.equal(res.status, 303);
      const a = await db.signupAttribution.findUnique({ where: { shopId: (await shopByEmail(email))! } });
      assert.ok(a);
      assert.deepEqual({ channel: a!.channel, pageType: a!.pageType, ctaId: a!.ctaId, landingPath: a!.landingPath, utmSource: a!.utmSource, referrerHost: a!.referrerHost }, { channel: "direct", pageType: "", ctaId: null, landingPath: "", utmSource: "", referrerHost: "" });
    } finally {
      delete process.env.ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED;
    }
  });

  test("signup route: flag off (default) creates the shop and NO attribution row", async () => {
    const email = `off-${run}@attr.test`;
    const res: Response = await signup(form({ email, ho_from: "commercial:demo" }));
    assert.equal(res.status, 303);
    const shopId = await shopByEmail(email);
    assert.ok(shopId);
    assert.equal(await db.signupAttribution.count({ where: { shopId: shopId! } }), 0);
  });

  test("signup route: an attribution write failure (even a missing table) never fails the signup", async () => {
    process.env.ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED = "true";
    const original = db.signupAttribution.createMany;
    (db.signupAttribution as any).createMany = async () => { throw new Error("relation \"garageos.SignupAttribution\" does not exist"); };
    const orig = console.error; console.error = () => undefined;
    try {
      const email = `fail-${run}@attr.test`;
      const res: Response = await signup(form({ email, ho_from: "commercial:demo" }));
      assert.equal(res.status, 303);
      assert.match(res.headers.get("location") ?? "", /verify-email-sent/, "same redirect as a normal signup");
      const shopId = await shopByEmail(email);
      assert.ok(shopId, "shop and owner exist");
      assert.equal(await db.signupAttribution.count({ where: { shopId: shopId! } }), 0);
      const sub = await db.subscription.findFirst({ where: { shopId: shopId! } });
      assert.ok(sub, "pending subscription still created");
    } finally {
      console.error = orig;
      (db.signupAttribution as any).createMany = original;
      delete process.env.ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED;
    }
  });

  test("validation errors keep the validated hand-off in the redirect", async () => {
    const res: Response = await signup(form({ password: "short", ho_from: "help:getting-started", ho_lang: "en", ho_utm_source: "me@x.com" }));
    const loc = new URL(res.headers.get("location") ?? "", "https://www.garage-os.ca");
    assert.equal(loc.pathname, "/admin/signup");
    assert.equal(loc.searchParams.get("from"), "help:getting-started");
    assert.equal(loc.searchParams.get("lang"), "en");
    assert.equal(loc.searchParams.get("utm_source"), null, "invalid values never come back");
  });

  test("cascade: deleting the shop deletes its attribution", async () => {
    const shop = await mkShop("Cascade");
    await lib.insertSignupAttribution(db, shop.id, buildSignupAttribution({ from: "home:x" }));
    assert.equal(await db.signupAttribution.count({ where: { shopId: shop.id } }), 1);
    await db.shop.delete({ where: { id: shop.id } });
    assert.equal(await db.signupAttribution.count({ where: { shopId: shop.id } }), 0);
  });

  test("read path is Super Admin only: shop users and anonymous callers cannot read it; aggregates fold small cells and expose no rows", async () => {
    const su = await db.user.create({ data: { name: "Root", email: `root-${run}@attr.test`, role: "SUPER_ADMIN" } });
    const shop = await mkShop("Reader");
    const owner = await db.user.create({ data: { name: "O", email: `o-${run}@attr.test`, role: "OWNER", shopId: shop.id } });
    const mech = await db.user.create({ data: { name: "M", email: `m-${run}@attr.test`, role: "MECHANIC", shopId: shop.id } });
    const viewer = await db.user.create({ data: { name: "V", email: `v-${run}@attr.test`, role: "VIEWER", shopId: shop.id } });
    // 6 "organic_search"-ish rows (>= 5, shown) and 2 "social" (< 5, folded) in an isolated future window
    const when = new Date("2032-05-05T12:00:00Z");
    const mk = async (i: number, channel: string) => {
      const s = await mkShop(`Agg${i}`);
      await db.signupAttribution.create({ data: { shopId: s.id, channel, pageType: "commercial", locale: "en", ctaId: null, createdAt: when } });
    };
    for (let i = 0; i < 6; i++) await mk(i, "organic_search");
    for (let i = 6; i < 8; i++) await mk(i, "social");
    const range = { from: new Date("2032-05-01T00:00:00Z"), to: new Date("2032-05-31T00:00:00Z") };

    for (const [role, id] of [["OWNER", owner.id], ["MECHANIC", mech.id], ["VIEWER", viewer.id]] as const) {
      setSession({ user: { id, role, shopId: shop.id } } as never);
      await assert.rejects(() => lib.getSignupAttributionSummary(range), (e: unknown) => String((e as Error).message).startsWith("NEXT_REDIRECT"), `${role} is redirected away`);
    }
    setSession(null);
    await assert.rejects(() => lib.getSignupAttributionSummary(range), (e: unknown) => String((e as Error).message).startsWith("NEXT_REDIRECT"), "anonymous is redirected away");

    setSession({ user: { id: su.id, role: "SUPER_ADMIN", shopId: null } } as never);
    const sum = await lib.getSignupAttributionSummary(range);
    assert.equal(sum.total, 8);
    assert.deepEqual(sum.byChannel, [{ key: "organic_search", count: 6 }, { key: "__other__", count: 2 }]);
    assert.deepEqual(sum.byPageType, [{ key: "commercial", count: 8 }]);
    const dump = JSON.stringify(sum);
    assert.ok(!dump.includes("shopId") && !dump.includes("landingPath"), "aggregates only");
    setSession(null);
  });

  test("cleanup", async () => {
    await db.$disconnect();
  });
}
