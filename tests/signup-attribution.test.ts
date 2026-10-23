// Signup attribution (Analytics v2): pure validation of the hand-off and wiring guarantees. No database.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { CTA_IDS } from "../src/lib/analytics/contract";
import {
  buildSignupAttribution,
  cleanReferrerHost,
  sanitizeHandoff,
  signupAttributionEnabled,
  signupHandoffHref,
} from "../src/lib/analytics/signup-attribution";

test("privacy flag: only the exact string 'true' enables attribution", () => {
  assert.equal(signupAttributionEnabled({} as never), false);
  for (const v of ["", "1", "TRUE", "yes", " true", "false"]) assert.equal(signupAttributionEnabled({ ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED: v } as never), false, v);
  assert.equal(signupAttributionEnabled({ ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED: "true" } as never), true);
});

test("hand-off: valid from/lang/lp/cta/utm survive, normalised", () => {
  const h = sanitizeHandoff({ from: "Commercial:Pricing", lang: "fr", lp: "/fr/tarifs?x=1#top", cta: "plan_select_pro", utm_source: "Newsletter", utm_medium: "email", utm_campaign: "promo-été-2026" });
  assert.deepEqual(h, { from: "commercial:pricing", lang: "fr", lp: "/fr/tarifs", cta: "plan_select_pro", utm_source: "newsletter", utm_medium: "email", utm_campaign: "promo-été-2026" });
});

test("hand-off: every invalid part is dropped (never stored)", () => {
  const h = sanitizeHandoff({
    from: "evil:pricing", lang: "es", lp: "/portal/abcdefghijklmnopqrstuvwxyz012345", cta: "buy_now",
    utm_source: "user@example.com", utm_medium: "514-555-0199", utm_campaign: "a".repeat(30),
  });
  assert.deepEqual(h, {});
  assert.deepEqual(sanitizeHandoff({ from: "commercial:", lp: "https://evil.example/x", cta: "" }), {});
  assert.deepEqual(sanitizeHandoff({ lp: "/admin/login" }), {}, "private paths are not landing paths");
  assert.deepEqual(sanitizeHandoff({ lp: "pricing" }), {});
  assert.deepEqual(sanitizeHandoff({ lp: "/" + "a".repeat(400) }), {});
  assert.deepEqual(sanitizeHandoff({ from: ["commercial:pricing", "x"], lang: ["en"] as never }), { from: "commercial:pricing", lang: "en" }, "repeated query params: first one wins");
  assert.deepEqual(sanitizeHandoff({ email: "a@b.c", ip: "1.2.3.4", visitorHash: "x", from: "help:getting-started" }), { from: "help:getting-started" }, "unknown keys are ignored");
  assert.deepEqual(sanitizeHandoff({}), {});
});

test("record: derived channel/pageType/locale; an empty hand-off is a direct first touch", () => {
  const r = buildSignupAttribution({ from: "help:getting-started", lang: "fr", lp: "/fr/aide", cta: "signup_start", utm_source: "google", utm_medium: "cpc" }, { formLocale: "en", referrerHost: "www.google.com", ownHost: "www.garage-os.ca" });
  assert.deepEqual(r, { landingPath: "/fr/aide", locale: "fr", channel: "campaign", pageType: "help", ctaId: "signup_start", utmSource: "google", utmMedium: "cpc", utmCampaign: "", referrerHost: "google.com" });
  const direct = buildSignupAttribution({}, { formLocale: "fr" });
  assert.deepEqual(direct, { landingPath: "", locale: "fr", channel: "direct", pageType: "", ctaId: null, utmSource: "", utmMedium: "", utmCampaign: "", referrerHost: "" });
  assert.equal(buildSignupAttribution({}).locale, "en");
  assert.equal(buildSignupAttribution({ lp: "/blog/useful-vehicle-history" }).pageType, "blog", "page type from a valid landing path when `from` is absent");
  assert.equal(buildSignupAttribution({ from: "garbage" }, { referrerHost: "l.facebook.com" }).channel, "social");
  assert.equal(buildSignupAttribution({ from: "garbage" }, { referrerHost: "blog.example" }).channel, "referral");
  // the stored record has exactly the allowed fields: no email/IP/hash/free text
  assert.deepEqual(Object.keys(direct).sort(), ["channel", "ctaId", "landingPath", "locale", "pageType", "referrerHost", "utmCampaign", "utmMedium", "utmSource"]);
});

test("referrer host: plain foreign hostnames only", () => {
  assert.equal(cleanReferrerHost("WWW.Example.COM"), "example.com");
  assert.equal(cleanReferrerHost("www.garage-os.ca", "garage-os.ca"), "", "own host dropped");
  for (const bad of ["https://evil.example/path", "a b", "x..y", "-bad.com", "a@b.com", "", null, 5, "a".repeat(101)]) assert.equal(cleanReferrerHost(bad), "", String(bad));
});

test("signup links carry only the contract hand-off", () => {
  const href = signupHandoffHref("/admin/signup", { pageType: "commercial", slug: "demo", lang: "en", landingPath: "/demo", ctaId: "signup_start" });
  const u = new URL(href, "https://x.test");
  assert.equal(u.pathname, "/admin/signup");
  assert.deepEqual([...u.searchParams.keys()].sort(), ["cta", "from", "lang", "lp"]);
  assert.equal(u.searchParams.get("from"), "commercial:demo");
  assert.equal(signupHandoffHref("/admin/signup", { pageType: "commercial", slug: "Bad Slug!", lang: "en", landingPath: "https://evil", ctaId: "signup_start" }), "/admin/signup?lang=en&cta=signup_start", "invalid parts are dropped from the link too");
  for (const id of CTA_IDS) assert.ok(signupHandoffHref("/admin/signup", { pageType: "home", slug: "x", lang: "en", landingPath: "/", ctaId: id }).includes(`cta=${id}`));
});

test("wiring: signup route captures AFTER the transaction, nothing in it touches attribution, and the page/form only echo validated values", () => {
  const route = fs.readFileSync("src/app/api/auth/signup/route.ts", "utf8");
  const tx = route.slice(route.indexOf("$transaction"), route.indexOf("} catch (err)", route.indexOf("$transaction")));
  assert.ok(!/ttribution/.test(tx), "the shop transaction does not contain attribution writes");
  assert.ok(route.indexOf("captureSignupAttribution(") > route.indexOf("} catch (err)"), "capture runs after the transaction block");
  assert.ok(route.indexOf("captureSignupAttribution(") < route.indexOf("sendVerificationEmail("));
  const lib = fs.readFileSync("src/lib/platform/signup-attribution.ts", "utf8");
  assert.match(lib, /skipDuplicates: true/);
  assert.ok(!/signupAttribution\.(update|upsert|updateMany|delete)/.test(lib), "rows are never updated");
  assert.ok(lib.indexOf("await requireSuperAdmin()") > -1 && lib.indexOf("await requireSuperAdmin()") < lib.indexOf("db.signupAttribution.count"));
  const page = fs.readFileSync("src/app/(site)/admin/signup/page.tsx", "utf8");
  assert.match(page, /signupAttributionEnabled\(\)/);
  assert.match(page, /sanitizeHandoff/);
  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  const model = schema.slice(schema.indexOf("model SignupAttribution"), schema.indexOf("enum ShopSmsNumberStatus"));
  assert.match(model, /shopId\s+String\s+@unique/);
  assert.match(model, /onDelete: Cascade/);
  assert.ok(!/email|ip\b|visitorHash|userAgent/i.test(model.replace(/\/\/\/.*$/gm, "")), "no email/IP/hash/UA columns");
});
