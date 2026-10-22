/* eslint-disable @typescript-eslint/no-explicit-any -- loose Prisma-arg fakes on purpose */
// SEC-06: POST /api/track is hardened. Every rejection is a silent 204; nothing private is ever stored.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "./helpers/action-harness";
import { patchDb } from "./helpers/db-mock";

process.env.NEXT_PUBLIC_APP_URL = "https://www.garage-os.ca";
const { POST } = await import("../src/app/api/track/route");
const { isAllowedTrackOrigin, readBoundedBody, parseTrackPayload } = await import("../src/lib/platform/track-guard");

const UA = "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0 Safari/537.36";
const GOOD_HEADERS: Record<string, string> = {
  host: "www.garage-os.ca",
  origin: "https://www.garage-os.ca",
  "sec-fetch-site": "same-origin",
  "user-agent": UA,
  "content-type": "application/json",
  "x-real-ip": "203.0.113.9",
};

function req(body: string | undefined, headers: Record<string, string> = {}, omit: string[] = []) {
  const h: Record<string, string> = { ...GOOD_HEADERS, ...headers };
  for (const k of omit) delete h[k];
  return new Request("https://www.garage-os.ca/api/track", { method: "POST", headers: h, body });
}

function setup(t: import("node:test").TestContext, count = 1) {
  const created: any[] = [];
  const rl = patchDb(t, "rateLimitBucket", "upsert", async () => ({ count }));
  patchDb(t, "shop", "findUnique", async () => null);
  patchDb(t, "pageView", "create", async (args: any) => (created.push(args.data), args.data));
  return { created, rl };
}

const ok = JSON.stringify({ path: "/pricing", locale: "en", referrer: "https://example.com/x", utmSource: "g", unknown: "ignored" });

async function expect204(r: Request) {
  const res = await POST(r);
  assert.equal(res.status, 204);
  assert.equal(await res.text(), "");
  return res;
}

test("happy path: writes exactly one normalised row, no IP/UA stored", async (t) => {
  const { created } = setup(t);
  await expect204(req(ok));
  assert.equal(created.length, 1);
  const row = created[0];
  assert.equal(row.path, "/pricing");
  assert.equal(row.locale, "en");
  assert.equal(row.referrerHost, "example.com");
  assert.match(row.visitorHash, /^[0-9a-f]{32}$/);
  const dump = JSON.stringify(row);
  assert.ok(!dump.includes("203.0.113.9") && !dump.includes("Mozilla") && !dump.includes("unknown"));
});

test("opt-out (DNT / Sec-GPC) is honoured first: no rate-limit hit, nothing stored", async (t) => {
  const { created, rl } = setup(t);
  await expect204(req(ok, { dnt: "1" }));
  await expect204(req(ok, { "sec-gpc": "1" }));
  assert.equal(created.length, 0);
  assert.equal(rl.mock.callCount(), 0);
});

test("oversized body (declared and streamed) is dropped before parsing", async (t) => {
  const { created } = setup(t);
  const big = JSON.stringify({ path: "/pricing", pad: "x".repeat(3000) });
  await expect204(req(big));
  assert.equal(await readBoundedBody(new Request("https://x.test/", { method: "POST", body: big })), null);
  // Streamed without content-length: bounded read stops at the cap.
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
  const streamed = new Request("https://x.test/", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  assert.equal(streamed.headers.get("content-length"), null);
  assert.equal(await readBoundedBody(streamed), null);
  assert.equal(created.length, 0);
});

test("invalid JSON, non-object bodies and bad locale are dropped", async (t) => {
  const { created } = setup(t);
  for (const body of ["{not json", "[]", "null", '"str"', JSON.stringify({ path: "/pricing", locale: "es" }), JSON.stringify({ locale: "en" })]) {
    await expect204(req(body));
  }
  assert.equal(created.length, 0);
});

test("invalid / private / token paths are never stored", async (t) => {
  const { created } = setup(t);
  const bad = [
    "/portal/abcdefghijklmnopqrstuvwxyz012345",
    "/quote/tok",
    "/admin/login",
    "//portal/abc",
    "/%71uote/abc",
    "/book/s/manage/tok",
    "pricing",
    "/" + "a".repeat(301),
    "",
    42,
  ];
  for (const path of bad) await expect204(req(JSON.stringify({ path, locale: "en" })));
  assert.equal(created.length, 0);
  // A query string (e.g. a /watch token) is stripped, never stored.
  await expect204(req(JSON.stringify({ path: "/watch/en?t=secrettoken", locale: "en" })));
  assert.equal(created.length, 1);
  assert.equal(created[0].path, "/watch/en");
  assert.ok(!JSON.stringify(created[0]).includes("secrettoken"));
});

test("foreign Origin, or no Origin without a same-site Sec-Fetch-Site, is dropped", async (t) => {
  const { created, rl } = setup(t);
  await expect204(req(ok, { origin: "https://evil.example" }));
  await expect204(req(ok, { origin: "null" }));
  await expect204(req(ok, { "sec-fetch-site": "cross-site" }));
  await expect204(req(ok, {}, ["origin", "sec-fetch-site"]));
  await expect204(req(ok, { "sec-fetch-site": "cross-site" }, ["origin"]));
  assert.equal(created.length, 0);
  assert.equal(rl.mock.callCount(), 0);
});

test("same-site variants are accepted", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  assert.equal(isAllowedTrackOrigin(h({ origin: "https://www.garage-os.ca" })), true);
  assert.equal(isAllowedTrackOrigin(h({ origin: "https://preview-x.vercel.app", host: "preview-x.vercel.app" })), true);
  assert.equal(isAllowedTrackOrigin(h({ "sec-fetch-site": "same-origin" })), true);
  assert.equal(isAllowedTrackOrigin(h({ "sec-fetch-site": "same-site" })), true);
  assert.equal(isAllowedTrackOrigin(h({ "sec-fetch-site": "none" })), true);
  assert.equal(isAllowedTrackOrigin(h({})), false);
  assert.equal(isAllowedTrackOrigin(h({ origin: "https://garage-os.ca.evil.example" })), false);
});

test("rate limit exceeded: silent 204, nothing stored; the limiter is the shared one (120/min per IP)", async (t) => {
  const { created, rl } = setup(t, 121);
  const res = await expect204(req(ok));
  assert.equal(res.headers.get("retry-after"), null);
  assert.equal(created.length, 0);
  assert.equal(rl.mock.callCount(), 1);
  const id = (rl.mock.calls[0].arguments[0] as any).where.id as string;
  assert.ok(id.startsWith("track-ip:"));
  const { RATE_LIMITS } = await import("../src/lib/rate-limit");
  assert.deepEqual(RATE_LIMITS.trackIp("1.2.3.4"), { key: "track-ip:1.2.3.4", limit: 120, windowSec: 60 });
  // at the limit it is still allowed
  const { created: c2 } = setup(t, 120);
  await expect204(req(ok));
  assert.equal(c2.length, 1);
});

test("bot user-agents are skipped", async (t) => {
  const { created } = setup(t);
  await expect204(req(ok, { "user-agent": "Googlebot/2.1" }));
  assert.equal(created.length, 0);
});

test("a database failure is swallowed and the log carries no payload, IP or UA", async (t) => {
  const { } = setup(t);
  patchDb(t, "pageView", "create", async () => {
    throw Object.assign(new Error("Invalid invocation data: path /pricing 203.0.113.9"), { name: "PrismaClientKnownRequestError" });
  });
  const logs: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  try {
    await expect204(req(ok));
  } finally {
    console.error = orig;
  }
  assert.ok(logs.length >= 1);
  for (const l of logs) assert.ok(!l.includes("203.0.113.9") && !l.includes("/pricing") && !l.includes("Mozilla"), l);
});

test("parseTrackPayload ignores unknown fields and bounds values", () => {
  const p = parseTrackPayload({ path: "/en/pricing?x=1#h", locale: "fr", shopSlug: "bad slug!", utmSource: "a".repeat(500), evil: 1 });
  assert.ok(p);
  assert.equal(p!.path, "/en/pricing");
  assert.equal(p!.locale, "fr");
  assert.equal(p!.shopSlug, "");
  assert.equal(p!.utmSource.length, 200);
  assert.ok(!("evil" in p!));
});

test("route wiring: opt-out check comes first, then origin, then rate limit, then body read", () => {
  const src = readFileSync("src/app/api/track/route.ts", "utf8");
  const order = ["isTrackingOptOut(", "isAllowedTrackOrigin(", "checkRateLimit(", "readBoundedBody(", "JSON.parse(", "parseTrackPayload(", "trackPageView({"].map((s) => src.indexOf(s, src.indexOf("export async function POST")));
  assert.ok(order.every((n) => n > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(!src.includes("req.json()"));
});
