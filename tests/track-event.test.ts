/* eslint-disable @typescript-eslint/no-explicit-any -- loose Prisma-arg fakes on purpose */
// Analytics v2: CTA click endpoint and server-side channel/pageType classification of page views.
import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/action-harness";
import { patchDb } from "./helpers/db-mock";

process.env.NEXT_PUBLIC_APP_URL = "https://www.garage-os.ca";
const { POST } = await import("../src/app/api/track/event/route");
const { POST: POST_VIEW } = await import("../src/app/api/track/route");
const { parseEventPayload } = await import("../src/lib/platform/track-guard");

const UA = "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0 Safari/537.36";
const HEADERS: Record<string, string> = {
  host: "www.garage-os.ca", origin: "https://www.garage-os.ca", "sec-fetch-site": "same-origin", "user-agent": UA,
  "content-type": "application/json", "x-real-ip": "203.0.113.9",
};
const req = (url: string, body: string, headers: Record<string, string> = {}) =>
  new Request(`https://www.garage-os.ca${url}`, { method: "POST", headers: { ...HEADERS, ...headers }, body });

function setup(t: import("node:test").TestContext, opts: { count?: number; recent?: boolean } = {}) {
  const created: any[] = [];
  const views: any[] = [];
  const rl = patchDb(t, "rateLimitBucket", "upsert", async () => ({ count: opts.count ?? 1 }));
  patchDb(t, "shop", "findUnique", async () => null);
  patchDb(t, "analyticsEvent", "findFirst", async () => (opts.recent ? { id: "x" } : null));
  patchDb(t, "analyticsEvent", "create", async (a: any) => (created.push(a.data), a.data));
  patchDb(t, "pageView", "create", async (a: any) => (views.push(a.data), a.data));
  return { created, views, rl };
}
const ok = JSON.stringify({ ctaId: "signup_start", path: "/pricing", locale: "en", extra: "ignored" });

test("a valid CTA click writes one event with a derived page type and no IP/UA", async (t) => {
  const { created } = setup(t);
  const res = await POST(req("/api/track/event", ok));
  assert.equal(res.status, 204);
  assert.equal(created.length, 1);
  assert.equal(created[0].type, "CTA_CLICK");
  assert.equal(created[0].ctaId, "signup_start");
  assert.equal(created[0].path, "/pricing");
  assert.equal(created[0].pageType, "commercial");
  assert.match(created[0].visitorHash, /^[0-9a-f]{32}$/);
  const dump = JSON.stringify(created[0]);
  assert.ok(!dump.includes("203.0.113.9") && !dump.includes("Mozilla") && !dump.includes("extra"));
});

test("unknown ids, private/token paths, bad locale, bad JSON and non-objects are dropped with 204", async (t) => {
  const { created } = setup(t);
  const bodies = [
    JSON.stringify({ ctaId: "buy_now", path: "/pricing" }), JSON.stringify({ ctaId: "signup_start", path: "/portal/abcdefghijklmnopqrstuvwxyz012345" }),
    JSON.stringify({ ctaId: "signup_start", path: "/admin/login" }), JSON.stringify({ ctaId: "signup_start", path: "/pricing", locale: "es" }),
    JSON.stringify({ path: "/pricing" }), "{bad", "[]", "null",
  ];
  for (const b of bodies) assert.equal((await POST(req("/api/track/event", b))).status, 204);
  assert.equal(created.length, 0);
});

test("DNT, GPC, foreign origin, oversized body and rate limit all drop silently", async (t) => {
  const { created, rl } = setup(t, { count: 31 });
  assert.equal((await POST(req("/api/track/event", ok, { dnt: "1" }))).status, 204);
  assert.equal((await POST(req("/api/track/event", ok, { "sec-gpc": "1" }))).status, 204);
  assert.equal((await POST(req("/api/track/event", ok, { origin: "https://evil.example" }))).status, 204);
  assert.equal((await POST(req("/api/track/event", JSON.stringify({ ctaId: "signup_start", path: "/pricing", pad: "x".repeat(3000) })))).status, 204);
  assert.equal(created.length, 0);
  assert.equal(rl.mock.callCount(), 1, "only the rate-limited request reached the limiter");
  assert.ok(((rl.mock.calls[0].arguments[0] as any).where.id as string).startsWith("track-event-ip:"));
});

test("the same visitor/CTA/path within a minute is stored once", async (t) => {
  const { created } = setup(t, { recent: true });
  await POST(req("/api/track/event", ok));
  assert.equal(created.length, 0);
});

test("bots are skipped and a database failure is swallowed without payload in the log", async (t) => {
  const { created } = setup(t);
  await POST(req("/api/track/event", ok, { "user-agent": "Googlebot/2.1" }));
  assert.equal(created.length, 0);
  patchDb(t, "analyticsEvent", "create", async () => { throw Object.assign(new Error("Invalid data /pricing 203.0.113.9"), { name: "PrismaClientKnownRequestError" }); });
  const logs: string[] = []; const orig = console.error; console.error = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  try { assert.equal((await POST(req("/api/track/event", ok))).status, 204); } finally { console.error = orig; }
  for (const l of logs) assert.ok(!l.includes("203.0.113.9") && !l.includes("/pricing"), l);
});

test("page views now store channel and page type, and a strict UTM allowlist", async (t) => {
  const { views } = setup(t);
  const view = (b: object) => POST_VIEW(req("/api/track", JSON.stringify(b)));
  await view({ path: "/pricing", locale: "en", referrer: "https://www.google.com/search?q=x" });
  await view({ path: "/fr/tarifs", locale: "fr", referrer: "https://l.facebook.com/" });
  await view({ path: "/blog/useful-vehicle-history", locale: "en", utmSource: "Newsletter", utmMedium: "email" });
  await view({ path: "/", locale: "en", utmSource: "user@example.com", utmCampaign: "514-555-0199" });
  assert.deepEqual(views.map((v) => [v.channel, v.pageType]), [["organic_search", "commercial"], ["social", "commercial"], ["email", "blog"], ["direct", "home"]]);
  assert.equal(views[2].utmSource, "newsletter");
  assert.equal(views[3].utmSource, "");
  assert.equal(views[3].utmCampaign, "");
});

test("parseEventPayload keeps only the three contract fields", () => {
  assert.deepEqual(parseEventPayload({ ctaId: "watch_play", path: "/watch/en?t=secret", locale: "fr", evil: 1 }), { ctaId: "watch_play", path: "/watch/en", locale: "fr" });
});

test("CTA events never store private/token paths, encoded variants, or a /watch ?t= token", async (t) => {
  const { created } = setup(t);
  const tok = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  const rejected = [
    `/portal/${tok}`, `/quote/${tok}`, `/inspection/${tok}`, `/book/some-shop/manage/${tok}`, `/sales/book/${tok}`, `/sales-invite/${tok}`,
    `/account-recovery/${tok}`, `/activate-demo/${tok}`, `//portal/${tok}`, `/%71uote/${tok}`, `/PORTAL/${tok}`, `/a/../portal/${tok}`, "/admin", "/platform/analytics", "/api/track", `\\portal\\${tok}`,
  ];
  for (const path of rejected) assert.equal((await POST(req("/api/track/event", JSON.stringify({ ctaId: "signup_start", path })))).status, 204);
  assert.equal(created.length, 0, "no private or token path is ever stored");
  // A tokenised public URL is accepted only after the query/hash are stripped; the token is never persisted.
  for (const path of [`/watch/en?t=${tok}`, `/watch/fr/teaser?t=${tok}&at=10#x`, `/pricing?utm_source=a@b.com`]) {
    await POST(req("/api/track/event", JSON.stringify({ ctaId: "watch_play", path })));
  }
  assert.deepEqual(created.map((c) => c.path), ["/watch/en", "/watch/fr/teaser", "/pricing"]);
  assert.ok(!JSON.stringify(created).includes(tok) && !JSON.stringify(created).includes("a@b.com"));
});

test("existing attribution survives: accented, mixed-case and dated campaign names are kept (lower-cased)", async (t) => {
  const { views } = setup(t);
  const view = (b: object) => POST_VIEW(req("/api/track", JSON.stringify(b)));
  await view({ path: "/fr/tarifs", locale: "fr", utmSource: "Facebook", utmMedium: "CPC", utmCampaign: "Promo-Été-2026" });
  await view({ path: "/pricing", locale: "en", utmSource: "newsletter", utmMedium: "email", utmCampaign: "email-blast-2026-10-22" });
  assert.deepEqual(views.map((v) => [v.utmSource, v.utmMedium, v.utmCampaign, v.channel]), [
    ["facebook", "cpc", "promo-été-2026", "campaign"],
    ["newsletter", "email", "email-blast-2026-10-22", "email"],
  ]);
});
