/* eslint-disable @typescript-eslint/no-explicit-any -- loose fakes on purpose */
// Analytics v2 CTA instrumentation (DORMANT by default): pure click logic, the privacy flag, the layout mount and the data-cta ids.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import "./helpers/action-harness";
import { patchDb } from "./helpers/db-mock";
import { CTA_IDS, isCtaId } from "../src/lib/analytics/contract";
import { buildCtaBody, clientOptedOut, findCtaId, handleCtaClick, pathnameOnly, PLAN_CTA_IDS, type CtaEventBody, type CtaNodeLike } from "../src/lib/analytics/cta-client";
import { ctaCollectionEnabled } from "../src/lib/analytics/cta-flag";

// A tiny DOM-free tree: node(attrs, parent).
const node = (attrs: Record<string, string>, parent: CtaNodeLike | null = null): CtaNodeLike => ({ getAttribute: (n) => (n in attrs ? attrs[n] : null), parentElement: parent });
const deps = (pathname: string, over: Partial<Parameters<typeof handleCtaClick>[1]> = {}) => {
  const sent: CtaEventBody[] = [];
  return { sent, d: { pathname, seen: new Set<string>(), send: (b: CtaEventBody) => void sent.push(b), ...over } };
};

test("findCtaId: reads data-cta from the target or a close ancestor, validates against the allowlist", () => {
  const link = node({ "data-cta": "signup_start" });
  assert.equal(findCtaId(link), "signup_start");
  assert.equal(findCtaId(node({}, node({}, link))), "signup_start", "icon/span inside the link");
  assert.equal(findCtaId(node({ "data-cta": "buy_now" })), null, "unknown ids are ignored");
  assert.equal(findCtaId(node({ "data-cta": "buy_now" }, link)), null, "the nearest data-cta decides; an invalid one does not fall through");
  assert.equal(findCtaId(node({})), null);
  assert.equal(findCtaId(null), null);
  let deep: CtaNodeLike = link;
  for (let i = 0; i < 20; i++) deep = node({}, deep);
  assert.equal(findCtaId(deep), null, "depth is bounded");
});

test("buildCtaBody: pathname only, locale from the path, private/untrackable paths refused", () => {
  assert.deepEqual(buildCtaBody("signup_start", "/pricing"), { ctaId: "signup_start", path: "/pricing", locale: "en" });
  assert.deepEqual(buildCtaBody("plan_select_pro", "/fr/tarifs"), { ctaId: "plan_select_pro", path: "/fr/tarifs", locale: "fr" });
  assert.deepEqual(buildCtaBody("pricing_view", "/"), { ctaId: "pricing_view", path: "/", locale: "en" });
  assert.deepEqual(buildCtaBody("signup_start", "/pricing?utm_source=x#top"), { ctaId: "signup_start", path: "/pricing", locale: "en" }, "query and fragment never survive");
  assert.equal(pathnameOnly("/a?b=1#c"), "/a");
  for (const p of ["/admin/login", "/portal/abcdefghijklmnopqrstuvwxyz012345", "/platform/analytics", "/api/track", "/book/shop/manage/abcdefghijklmnopqrstuvwxyz012345", "/sales/x", "", "pricing"]) {
    assert.equal(buildCtaBody("signup_start", p), null, p);
  }
  assert.deepEqual(Object.keys(buildCtaBody("signup_start", "/pricing")!).sort(), ["ctaId", "locale", "path"], "nothing else is sent");
});

test("handleCtaClick: sends once per (ctaId, path) per page view, EN and FR, never throws", () => {
  const { sent, d } = deps("/fr/tarifs");
  const link = node({ "data-cta": "plan_select_core" });
  assert.equal(handleCtaClick(link, d), true);
  assert.equal(handleCtaClick(link, d), false, "double click is not counted twice");
  assert.equal(handleCtaClick(node({ "data-cta": "plan_select_pro" }), d), true, "another CTA on the same page counts");
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], { ctaId: "plan_select_core", path: "/fr/tarifs", locale: "fr" });
  // a new page view = a new Set from the caller
  const again = deps("/fr/tarifs");
  assert.equal(handleCtaClick(link, again.d), true);
  // EN path
  const en = deps("/pricing");
  handleCtaClick(link, en.d);
  assert.equal(en.sent[0].locale, "en");
});

test("handleCtaClick: ignores private paths, opted-out browsers, non-CTA clicks, and swallows transport errors", () => {
  const link = node({ "data-cta": "signup_start" });
  const priv = deps("/portal/abcdefghijklmnopqrstuvwxyz012345");
  assert.equal(handleCtaClick(link, priv.d), false);
  assert.equal(priv.sent.length, 0);
  const dnt = deps("/pricing", { optedOut: true });
  assert.equal(handleCtaClick(link, dnt.d), false);
  const none = deps("/pricing");
  assert.equal(handleCtaClick(node({}), none.d), false);
  assert.equal(handleCtaClick(null, none.d), false);
  const boom = deps("/pricing", { send: () => { throw new Error("network down"); } });
  assert.doesNotThrow(() => handleCtaClick(link, boom.d));
});

test("the handler takes the click target only: it has no way to preventDefault, and it is synchronous", () => {
  const src = fs.readFileSync("src/lib/analytics/cta-client.ts", "utf8");
  assert.ok(!/preventDefault|stopPropagation|await |setTimeout|localStorage|sessionStorage|document\.cookie/.test(src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")));
  const comp = fs.readFileSync("src/components/analytics/CtaClickListener.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/preventDefault|await |setTimeout|localStorage|sessionStorage|document\.cookie/.test(comp));
  assert.match(comp, /passive: true/);
});

test("clientOptedOut honours DNT and GPC", () => {
  assert.equal(clientOptedOut({ doNotTrack: "1" }), true);
  assert.equal(clientOptedOut({ globalPrivacyControl: true }), true);
  assert.equal(clientOptedOut({ doNotTrack: "0", globalPrivacyControl: false }), false);
  assert.equal(clientOptedOut(undefined), false);
});

test("flag: only the exact string 'true' enables collection", () => {
  assert.equal(ctaCollectionEnabled({} as any), false);
  for (const v of ["", "1", "TRUE", "True", "yes", "on", " true", "false"]) assert.equal(ctaCollectionEnabled({ ANALYTICS_CTA_ENABLED: v } as any), false, v);
  assert.equal(ctaCollectionEnabled({ ANALYTICS_CTA_ENABLED: "true" } as any), true);
});

test("layout mount: with the flag off nothing is rendered (no listener element, no props); with it on the listener gets enabled=true", async () => {
  const { CtaListenerMount } = await import("../src/components/analytics/CtaListenerMount");
  const { default: CtaClickListener } = await import("../src/components/analytics/CtaClickListener");
  const saved = process.env.ANALYTICS_CTA_ENABLED;
  try {
    delete process.env.ANALYTICS_CTA_ENABLED;
    assert.equal(CtaListenerMount(), null, "default is OFF");
    process.env.ANALYTICS_CTA_ENABLED = "false";
    assert.equal(CtaListenerMount(), null);
    assert.equal(CtaListenerMount({ enabled: false }), null);
    process.env.ANALYTICS_CTA_ENABLED = "true";
    const el = CtaListenerMount() as any;
    assert.equal(el.type, CtaClickListener);
    assert.deepEqual(el.props, { enabled: true });
  } finally {
    if (saved === undefined) delete process.env.ANALYTICS_CTA_ENABLED; else process.env.ANALYTICS_CTA_ENABLED = saved;
  }
  const shell = fs.readFileSync("src/components/root/RootShell.tsx", "utf8");
  assert.match(shell, /<CtaListenerMount \/>/);
});

test("route: flag off answers 204 before the limiter or any database access, and writes nothing", async (t) => {
  process.env.NEXT_PUBLIC_APP_URL = "https://www.garage-os.ca";
  const { POST } = await import("../src/app/api/track/event/route");
  const rl = patchDb(t, "rateLimitBucket", "upsert", async () => ({ count: 1 }));
  const find = patchDb(t, "analyticsEvent", "findFirst", async () => null);
  const create = patchDb(t, "analyticsEvent", "create", async (a: any) => a.data);
  const saved = process.env.ANALYTICS_CTA_ENABLED;
  const req = () => new Request("https://www.garage-os.ca/api/track/event", {
    method: "POST",
    headers: { host: "www.garage-os.ca", origin: "https://www.garage-os.ca", "sec-fetch-site": "same-origin", "user-agent": "Mozilla/5.0 Chrome/120", "content-type": "application/json", "x-real-ip": "203.0.113.9" },
    body: JSON.stringify({ ctaId: "signup_start", path: "/pricing", locale: "en" }),
  });
  try {
    for (const v of [undefined, "false", "1", ""]) {
      if (v === undefined) delete process.env.ANALYTICS_CTA_ENABLED; else process.env.ANALYTICS_CTA_ENABLED = v;
      const res = await POST(req());
      assert.equal(res.status, 204);
    }
    assert.equal(rl.mock.callCount(), 0, "limiter untouched");
    assert.equal(find.mock.callCount() + create.mock.callCount(), 0, "no database access");
    process.env.ANALYTICS_CTA_ENABLED = "true";
    assert.equal((await POST(req())).status, 204);
    assert.equal(create.mock.callCount(), 1, "control: with the flag on the same request is stored");
  } finally {
    if (saved === undefined) delete process.env.ANALYTICS_CTA_ENABLED; else process.env.ANALYTICS_CTA_ENABLED = saved;
  }
});

// ---- every data-cta id in the code and in prerendered HTML is an allowlisted id ----

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("source: every data-cta value is a CTA_IDS member; the ids that are used are exactly the placed ones", () => {
  const found = new Set<string>();
  for (const f of walk("src")) {
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(/(?:data-cta|playCta)=(?:"([^"]*)"|\{([^}]*)\})/g)) {
      if (m[1] !== undefined) found.add(m[1]);
      else for (const q of (m[2] ?? "").matchAll(/"([^"]*)"/g)) found.add(q[1]);
    }
  }
  for (const id of PLAN_CTA_IDS) found.add(id);
  assert.ok(found.size >= 7, `found ${[...found].join(",")}`);
  for (const id of found) assert.ok(isCtaId(id), `data-cta "${id}" is not an allowlisted CTA id`);
  for (const id of CTA_IDS) assert.ok(found.has(id), `CTA id ${id} is not placed anywhere`);
  assert.deepEqual([...PLAN_CTA_IDS], ["plan_select_core", "plan_select_pro", "plan_select_complete"]);
});

const BUILT = path.join(process.cwd(), ".next/server/app");
test("prerendered HTML: data-cta ids are allowlisted (needs `next build`)", { skip: !fs.existsSync(BUILT) && "run `next build` first" }, () => {
  const htmlFiles: string[] = [];
  (function w(d: string) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else if (p.endsWith(".html")) htmlFiles.push(p); } })(BUILT);
  let count = 0;
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, "utf8");
    for (const m of html.matchAll(/data-cta="([^"]*)"/g)) { count += 1; assert.ok(isCtaId(m[1]), `${path.relative(BUILT, f)}: ${m[1]}`); }
    assert.ok(!/data-cta=""/.test(html));
  }
  assert.ok(count > 0, "marketing pages carry data-cta attributes");
  // the pricing page: three plan cards, EN and FR
  for (const f of ["pricing.html", "fr/tarifs.html"]) {
    const p = path.join(BUILT, f);
    if (!fs.existsSync(p)) continue;
    const html = fs.readFileSync(p, "utf8");
    for (const id of PLAN_CTA_IDS) assert.ok(html.includes(`data-cta="${id}"`), `${f} has ${id}`);
  }
});

test("a tokenised /watch view never carries a CTA id", () => {
  const s = fs.readFileSync("src/components/video/WatchClient.tsx", "utf8");
  const attrs = [...s.matchAll(/data-cta=\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(attrs.length >= 3);
  for (const a of attrs) assert.match(a, /^token \? undefined : "/, a);
  assert.match(s, /playCta=\{token \? undefined : "watch_play"\}/);
});
