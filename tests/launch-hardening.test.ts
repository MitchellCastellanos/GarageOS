// Block 15 — launch hardening regressions (isolation of helpers, rate limiting, redirects, refund PDFs,
// restricted online booking). Provider calls are mocked; DB access is patched in-process.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { patchDb } from "./helpers/db-mock";
import "./helpers/action-harness";

const rl = await import("../src/lib/rate-limit");
const { isSafeCallbackPath } = await import("../src/lib/safe-redirect");

const ROOT = path.resolve(import.meta.dirname, "..");

// ── Server actions must not expose tenant-parameterised helpers ─────────────
test("no 'use server' export takes a caller-supplied shopId without its own authorization", () => {
  const dir = path.join(ROOT, "src/actions");
  const AUTH = /requireSuperAdmin|requireShopSession|getOrganizationAdminContext|getAccessibleShops|requireOwner|getShopId|getWritableShopId|requirePermissions|requireSession/;
  const offenders: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(path.join(dir, file), "utf8");
    const parts = src.split(/\nexport async function /).slice(1);
    for (const part of parts) {
      const name = part.split("(")[0];
      const signature = /^[^]*?\)\s*(?::[^\n]*?)?\{\n/.exec(part)?.[0] ?? part.slice(0, 300);
      if (!/\bshopId\b/.test(signature)) continue;
      const body = part.split(/\nexport /)[0];
      if (!AUTH.test(body)) offenders.push(`${file}:${name}`);
    }
  }
  assert.deepEqual(offenders, [], "these server actions are public endpoints that trust a caller-supplied shopId");
});

test("shopId-taking helpers live in server-only lib modules, not in server actions", () => {
  for (const [file, fn] of [
    ["src/actions/line-items.ts", "syncSavedLineItems"],
    ["src/actions/cash-drawer.ts", "ensureCashInFromInvoice"],
    ["src/actions/support.ts", "hasUnreadSupportMessage"],
  ] as const) {
    assert.ok(!readFileSync(path.join(ROOT, file), "utf8").includes(`function ${fn}`), `${fn} must not be exported from ${file}`);
  }
});

// ── Rate limiter ────────────────────────────────────────────────────────────
function fakeBuckets(t: import("node:test").TestContext) {
  const rows = new Map<string, number>();
  patchDb(t, "rateLimitBucket", "upsert", (async ({ where, create }: { where: { id: string }; create: { count: number } }) => {
    const next = (rows.get(where.id) ?? 0) + (rows.has(where.id) ? 1 : create.count);
    rows.set(where.id, next);
    return { count: next };
  }) as never);
  return rows;
}

test("rate limiter: allows up to the limit, blocks after, resets on the next window", async (t) => {
  fakeBuckets(t);
  const rule = { key: "k", limit: 3, windowSec: 60 };
  const t0 = new Date("2026-10-01T12:00:10Z");
  for (let i = 0; i < 3; i++) assert.equal((await rl.checkRateLimit(rule, t0)).allowed, true);
  const blocked = await rl.checkRateLimit(rule, t0);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 60);
  assert.equal((await rl.checkRateLimit(rule, new Date("2026-10-01T12:01:05Z"))).allowed, true, "new window");
  assert.equal((await rl.checkRateLimit({ ...rule, key: "other" }, t0)).allowed, true, "keys are independent");
});

test("rate limiter fails open when the database is unavailable", async (t) => {
  patchDb(t, "rateLimitBucket", "upsert", (async () => {
    throw new Error("db down");
  }) as never);
  t.mock.method(console, "error", () => {});
  assert.equal((await rl.checkRateLimit({ key: "k", limit: 1, windowSec: 60 })).allowed, true);
});

test("client IP prefers x-real-ip, then the first x-forwarded-for hop", () => {
  const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });
  assert.equal(rl.clientIpFromHeaders(h({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" })), "1.1.1.1");
  assert.equal(rl.clientIpFromHeaders(h({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" })), "2.2.2.2");
  assert.equal(rl.clientIpFromHeaders(h({})), "unknown");
});

test("login policy: per-account budget is tighter than per-IP", () => {
  assert.ok(rl.RATE_LIMITS.loginEmail("a@b.c").limit <= 10);
  assert.ok(rl.RATE_LIMITS.loginIp("1.1.1.1").limit > rl.RATE_LIMITS.loginEmail("a@b.c").limit);
  assert.equal(rl.RATE_LIMITS.loginEmail("A@B.c").key, rl.RATE_LIMITS.loginEmail("a@b.C").key, "case-insensitive account key");
});

// ── Open redirect ───────────────────────────────────────────────────────────
test("post-login callback must be a same-site path", () => {
  for (const ok of ["/admin/dashboard", "/admin/invoices?x=1", "/dashboard"]) assert.equal(isSafeCallbackPath(ok), true, ok);
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil.example", "/ok\nSet-Cookie: x=1", ""]) {
    assert.equal(isSafeCallbackPath(bad), false, JSON.stringify(bad));
  }
});

// ── Portal throttling ───────────────────────────────────────────────────────
test("portal: a flooding IP is rate-limited before any token lookup; garbage tokens burn a small budget", async (t) => {
  const portal = await import("../src/lib/portal");
  const rows = fakeBuckets(t);
  let lookups = 0;
  patchDb(t, "customerPortalAccess", "findUnique", (async () => {
    lookups++;
    return null;
  }) as never);
  rl.setIpProviderForTests(() => "9.9.9.9");
  t.after(() => rl.setIpProviderForTests(null));

  const garbage = "not-a-token";
  let limited = 0;
  for (let i = 0; i < 40; i++) {
    const r = await portal.resolvePortalAccess(garbage);
    if (!r.ok && r.reason === "RATE_LIMITED") limited++;
  }
  assert.ok(limited >= 10, "guessing from one IP is cut off quickly");
  assert.equal(lookups, 0, "malformed tokens never hit the database");
  assert.ok(rows.size > 0);

  // another IP is unaffected
  rl.setIpProviderForTests(() => "8.8.8.8");
  const r = await portal.resolvePortalAccess(garbage);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "INVALID");
});

// ── Stripe price guard (pure) ───────────────────────────────────────────────
test("Stripe price guard rejects the stale pre-launch sandbox prices", async () => {
  const { priceMismatchReason } = await import("../src/lib/stripe");
  const good = { active: true, currency: "cad", unit_amount: 29900, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } } as never;
  assert.equal(priceMismatchReason(good, "PRO", "MONTHLY"), null);
  assert.match(priceMismatchReason({ ...(good as object), unit_amount: 24900 } as never, "PRO", "MONTHLY") ?? "", /amount/);
  assert.match(priceMismatchReason({ ...(good as object), unit_amount: 249000, recurring: { interval: "year", interval_count: 1 } } as never, "PRO", "YEARLY") ?? "", /amount/);
  assert.equal(priceMismatchReason({ ...(good as object), unit_amount: 299000, recurring: { interval: "year", interval_count: 1 } } as never, "PRO", "YEARLY"), null);
  assert.equal(priceMismatchReason({ ...(good as object), unit_amount: 44900 } as never, "COMPLETE", "MONTHLY"), null);
  assert.equal(priceMismatchReason({ ...(good as object), unit_amount: 19900 } as never, "CORE", "MONTHLY"), null);
  assert.equal(priceMismatchReason({ ...(good as object), unit_amount: 199000, recurring: { interval: "year", interval_count: 1 } } as never, "CORE", "YEARLY"), null);
});

// ── Refund presentation on invoice PDFs ─────────────────────────────────────
function collectText(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collectText(n, out));
    return out;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (typeof el.type === "function") return collectText((el.type as (p: unknown) => unknown)(el.props), out);
  if (el.props) collectText(el.props.children, out);
  return out;
}

test("invoice PDF: fully refunded invoices read REFUNDED, partial refunds show refund + net paid", async () => {
  const { InvoiceDocument } = await import("../src/components/pdf/InvoiceDocument");
  const base = {
    invoiceNumber: "INV-1", status: "PAID", issuedAt: new Date("2026-09-01T15:00:00Z"), subtotal: "100.00", taxRate: "0.14975",
    taxAmount: "14.98", total: "114.98", language: "EN",
    taxSnapshot: { v: 1, source: "issue", exempt: false, lines: [{ name: "GST", rate: 0.05, amount: "5.00" }, { name: "QST", rate: 0.09975, amount: "9.98" }] },
    client: { firstName: "A" },
    vehicles: [{ lineItems: [{ description: "Oil", quantity: "1", unitPrice: "100", lineTotal: "100", itemType: "LABOUR" }], vehicle: { make: "K", model: "L", year: 2020, licensePlate: "X", mileageUnit: "KM" } }],
    shop: { name: "S", timezone: "America/Montreal" },
  };
  const render = (refunds?: { amount: string; refundedAt: Date }[]) =>
    collectText(InvoiceDocument({ invoice: { ...base, refunds } as never }) as unknown).join(" | ");

  const plain = render();
  assert.match(plain, /PAID/);
  assert.doesNotMatch(plain, /REFUNDED|NET PAID/);

  const partial = render([{ amount: "20.00", refundedAt: new Date("2026-09-02T15:00:00Z") }]);
  assert.match(partial, /Refunded/);
  assert.match(partial, /NET PAID/);
  assert.match(partial, /94\.98/);
  assert.doesNotMatch(partial, /REFUNDED/, "a partial refund keeps the PAID status");

  const full = render([{ amount: "114.98", refundedAt: new Date("2026-09-02T15:00:00Z") }]);
  assert.match(full, /REFUNDED/);
  assert.doesNotMatch(full, /\| PAID \|/, "no PAID watermark on a fully refunded invoice");
  assert.match(full, /0\.00/);

  const fr = collectText(InvoiceDocument({ invoice: { ...base, language: "FR", refunds: [{ amount: "114.98", refundedAt: new Date() }] } as never }) as unknown).join(" | ");
  assert.match(fr, /REMBOURSÉ/);
});

// ── Restricted shops do not take new online bookings ───────────────────────
test("public booking is closed for a shop without a paying subscription", async (t) => {
  const { getShopBySlug } = await import("../src/lib/booking-slots");
  patchDb(t, "shop", "findUnique", (async (args: { where: { id?: string; slug?: string } }) => {
    if (args.where.slug) return { id: "shop-A", slug: "s", bookingEnabled: true, workingHours: [] };
    return { organizationId: null, subscription: sub };
  }) as never);
  let sub: Record<string, unknown> | null = null;
  const DAY = 86_400_000;
  const row = (status: string, plan: string | null) => ({
    id: "s", shopId: "shop-A", plan, status, billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 20 * DAY),
    cancelAtPeriodEnd: false, stripeCustomerId: "c", stripeSubscriptionId: "sub", stripePriceId: "p", billingEmail: null,
  });
  sub = row("ACTIVE", "CORE");
  assert.equal((await getShopBySlug("s"))?.bookingEnabled, true);
  sub = row("CANCELED", "CORE");
  assert.equal((await getShopBySlug("s"))?.bookingEnabled, false);
  sub = null;
  assert.equal((await getShopBySlug("s"))?.bookingEnabled, false, "missing subscription row is a recovery state, not free service");
});

// ── Upload policy ───────────────────────────────────────────────────────────
test("uploads: only inert image/document types reach the public bucket", async () => {
  const { isAllowedPhotoType, isAllowedDocumentType } = await import("../src/lib/upload-policy");
  for (const ok of ["image/jpeg", "image/png", "image/webp", "IMAGE/JPEG"]) assert.equal(isAllowedPhotoType(ok), true, ok);
  for (const bad of ["text/html", "image/svg+xml", "application/javascript", "application/octet-stream", "", null, undefined]) {
    assert.equal(isAllowedPhotoType(bad as never), false, String(bad));
    assert.equal(isAllowedDocumentType(bad as never), false, String(bad));
  }
  assert.equal(isAllowedDocumentType("application/pdf"), true);
  assert.equal(isAllowedDocumentType("text/csv"), true);
  assert.equal(isAllowedDocumentType("image/svg+xml"), false);
  assert.equal(isAllowedDocumentType("text/html"), false);
});

// ── Time / DST (Quebec) ─────────────────────────────────────────────────────
test("shop-local time parsing survives DST: gap times don't throw, days are 23/25h long, impossible dates still throw", async () => {
  const tz = await import("../src/lib/shop-timezone");
  const Z = "America/Montreal";
  // normal winter (EST, -5) and summer (EDT, -4)
  assert.equal(tz.parseShopDateTime("2027-01-15", "09:00", Z).toISOString(), "2027-01-15T14:00:00.000Z");
  assert.equal(tz.parseShopDateTime("2027-07-15", "09:00", Z).toISOString(), "2027-07-15T13:00:00.000Z");
  // spring forward 2027-03-14: 02:30 does not exist -> first valid instant after the gap (03:00 EDT)
  assert.equal(tz.parseShopDateTime("2027-03-14", "02:30", Z).toISOString(), "2027-03-14T07:00:00.000Z");
  assert.equal(tz.parseShopDateTime("2027-03-14", "09:00", Z).toISOString(), "2027-03-14T13:00:00.000Z", "opening hour after the change is EDT");
  // fall back 2026-11-01
  assert.equal(tz.parseShopDateTime("2026-11-01", "09:00", Z).toISOString(), "2026-11-01T14:00:00.000Z");
  // day boundaries
  const spring = tz.getDayRangeShop("2027-03-14", Z);
  assert.equal((spring.end.getTime() - spring.start.getTime()) / 3_600_000, 23);
  const fall = tz.getDayRangeShop("2026-11-01", Z);
  assert.equal((fall.end.getTime() - fall.start.getTime()) / 3_600_000, 25);
  assert.equal(tz.addShopDays("2027-03-13", 1, Z), "2027-03-14");
  assert.equal(tz.addShopDays("2026-10-31", 2, Z), "2026-11-02");
  // round trip keeps the calendar day in the shop's zone even late in the evening UTC
  const late = new Date("2027-04-02T02:30:00Z");
  assert.equal(tz.formatShopDate(late, Z), "2027-04-01");
  assert.throws(() => tz.parseShopDateTime("2027-02-30", "10:00", Z));
});

// ── Server -> Client boundary: dictionaries containing functions crash production renders ─────────────
function hasFunction(value: unknown, seen = new Set<unknown>()): string | null {
  if (typeof value === "function") return "(function)";
  if (value && typeof value === "object") {
    if (seen.has(value)) return null;
    seen.add(value);
    for (const [k, v] of Object.entries(value)) {
      const hit = hasFunction(v, seen);
      if (hit) return `${k}.${hit}`;
    }
  }
  return null;
}

test("server pages never hand a function-bearing dictionary to a client component", async () => {
  const { globSync } = await import("node:fs");
  const files = globSync("src/app/**/*.tsx", { cwd: ROOT }).filter((f) => !f.endsWith("layout.tsx") || true);
  const offenders: string[] = [];
  const dictModules = new Map<string, Record<string, unknown>>();
  for (const f of readdirSync(path.join(ROOT, "src/lib/admin-locale")).filter((n) => n.endsWith(".ts"))) {
    const mod = (await import(`../src/lib/admin-locale/${f.replace(/\.ts$/, "")}`)) as Record<string, unknown>;
    for (const [name, value] of Object.entries(mod)) if (/_DICT$/.test(name)) dictModules.set(name, value as Record<string, unknown>);
  }
  for (const rel of files) {
    const src = readFileSync(path.join(ROOT, rel), "utf8");
    if (src.startsWith('"use client"')) continue; // only server components can violate the rule
    // aliases: const t = FOO_DICT[locale];  ->  prop={t} / prop={t.section}
    const aliases = new Map<string, string>();
    for (const a of src.matchAll(/const\s+(\w+)\s*=\s*(?:await\s+)?([A-Z0-9_]+_DICT)\[\w+\]\s*;/g)) aliases.set(a[1], a[2]);
    const candidates: { text: string; index: number; dict: string; sub: string }[] = [];
    for (const m of src.matchAll(/=\{\s*([A-Z0-9_]+_DICT)\[(\w+)\]((?:\.\w+)*)\s*\}/g)) candidates.push({ text: m[0], index: m.index!, dict: m[1], sub: m[3] });
    for (const [alias, dict] of aliases) {
      for (const m of src.matchAll(new RegExp(`=\\{\\s*${alias}((?:\\.\\w+)*)\\s*\\}`, "g"))) candidates.push({ text: m[0], index: m.index!, dict, sub: m[1] });
    }
    for (const c of candidates) {
      const dict = dictModules.get(c.dict);
      if (!dict) continue;
      let node: unknown = dict.en ?? Object.values(dict)[0];
      for (const key of c.sub.split(".").filter(Boolean)) node = (node as Record<string, unknown>)?.[key];
      const fn = hasFunction(node);
      if (!fn) continue;
      // Only a violation when the receiving component is a client component.
      const before = src.slice(0, c.index);
      const tag = [...before.matchAll(/<([A-Z]\w*)/g)].pop()?.[1];
      const importLine = tag && new RegExp(`import[^;]*\\b${tag}\\b[^;]*from\\s+"@/([^"]+)"`).exec(src);
      const target = importLine ? path.join(ROOT, "src", importLine[1]) : null;
      const file = target && [".tsx", ".ts", "/index.tsx"].map((e) => target + e).find((x) => { try { readFileSync(x); return true; } catch { return false; } });
      if (file && readFileSync(file, "utf8").trimStart().startsWith('"use client"')) offenders.push(`${rel}: <${tag}> (client) receives ${c.text} containing ${fn}`);
    }
  }
  assert.deepEqual(offenders, []);
});

// ── Cron endpoints fail closed ──────────────────────────────────────────────
test("cron auth: no secret configured authorizes nothing (not even 'Bearer undefined'); wrong/short secrets refused", async () => {
  const { isAuthorizedCronRequest } = await import("../src/lib/cron-auth");
  const req = (h?: string) => new Request("https://x.test/api/webhooks/cron", { headers: h ? { authorization: h } : {} });
  const SECRET = "a-long-enough-cron-secret-0123456789";
  assert.equal(isAuthorizedCronRequest(req(`Bearer ${SECRET}`), SECRET), true);
  assert.equal(isAuthorizedCronRequest(req(`Bearer ${SECRET}x`), SECRET), false);
  assert.equal(isAuthorizedCronRequest(req(), SECRET), false);
  assert.equal(isAuthorizedCronRequest(req("Bearer undefined"), undefined), false, "unset secret must fail closed");
  assert.equal(isAuthorizedCronRequest(req("Bearer "), ""), false);
  assert.equal(isAuthorizedCronRequest(req("Bearer short"), "short"), false, "guessable secrets are refused");
  for (const route of ["cron/route.ts", "cron/campaigns/route.ts", "cron/quickbooks/route.ts"]) {
    const src = readFileSync(path.join(ROOT, "src/app/api/webhooks", route), "utf8");
    assert.match(src, /isAuthorizedCronRequest/, route);
    assert.doesNotMatch(src, /Bearer \$\{process\.env\.CRON_SECRET\}/, route);
  }
});
