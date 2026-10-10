import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import robots from "../src/app/robots";
import nextConfig from "../next.config";
import {
  PRIVATE_HEADER_SOURCES,
  PRIVATE_ROUTE_PREFIXES,
  TOKEN_HEADER_SOURCES,
  isPrivatePath,
  isTokenPath,
  isTrackablePath,
  privatePathRegexSources,
} from "../src/lib/privacy/private-paths";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const PRIVATE_SAMPLES = [
  "/admin",
  "/admin/login",
  "/admin/dashboard",
  "/platform/sales/prospects/abc",
  "/api/track",
  "/portal/tokenvalue",
  "/portal/tokenvalue/invoices/inv1",
  "/portal/shop/some-shop",
  "/quote/tokenvalue",
  "/inspection/tokenvalue",
  "/inspection/tokenvalue/photo/p1",
  "/book/some-shop/manage/tokenvalue",
  "/sales/book/tokenvalue",
  "/sales/meeting/tokenvalue",
  "/sales/unsubscribe/tokenvalue",
  "/sales-invite/staff1",
  "/sales-recover",
  "/sales-recovery-email/staff1",
  "/account-recovery",
  "/activate-demo/demo1",
];

const PUBLIC_SAMPLES = [
  "/",
  "/help",
  "/guides/set-up-your-shop",
  "/pricing",
  "/book/some-shop",
  "/book/some-shop/", // shop landing page (public)
  "/watch/en",
  "/watch/fr/teaser",
  "/demo",
  "/quote-software", // future public page: shares a prefix string with /quote but is another segment
  "/salesforce-alternative",
  "/inspections-guide",
  "/portal-features",
  "/apixyz",
  "/administration",
];

test("private and token routes are recognized; public look-alikes are not", () => {
  for (const p of PRIVATE_SAMPLES) assert.equal(isPrivatePath(p), true, `${p} must be private`);
  for (const p of PUBLIC_SAMPLES) assert.equal(isPrivatePath(p), false, `${p} must stay public`);
});

test("query strings and hashes do not change classification", () => {
  assert.equal(isPrivatePath("/quote/abc?x=1#y"), true);
  assert.equal(isPrivatePath("/help?q=quote"), false);
});

test("token routes are a subset of private routes and exclude the app/API", () => {
  for (const p of PRIVATE_SAMPLES) {
    if (isTokenPath(p)) assert.equal(isPrivatePath(p), true);
  }
  assert.equal(isTokenPath("/quote/abc"), true);
  assert.equal(isTokenPath("/book/s/manage/t"), true);
  assert.equal(isTokenPath("/admin/login"), false);
  assert.equal(isTokenPath("/api/track"), false);
  assert.equal(isTokenPath("/book/s"), false);
});

test("analytics never records a private/token path, nor the local booking replica", () => {
  for (const p of PRIVATE_SAMPLES) assert.equal(isTrackablePath(p), false, `${p} must not be tracked`);
  assert.equal(isTrackablePath("/demo/booking"), false);
  for (const p of PUBLIC_SAMPLES) assert.equal(isTrackablePath(p), true, `${p} must be tracked`);
});

test("analytics wiring: the beacon and the endpoint both apply the same guard", () => {
  assert.match(read("src/components/AnalyticsBeacon.tsx"), /isTrackablePath\(pathname\)/);
  const server = read("src/lib/platform/analytics.ts");
  const guard = server.indexOf("isTrackablePath(input.path)");
  assert.ok(guard > 0, "trackPageView must check isTrackablePath(input.path)");
  assert.ok(guard < server.indexOf("db.pageView.create"), "the guard must run before the insert");
});

test("regex sources (used to purge old rows) agree with isPrivatePath", () => {
  const regexes = privatePathRegexSources().map((r) => new RegExp(r.source));
  for (const p of [...PRIVATE_SAMPLES, ...PUBLIC_SAMPLES]) {
    assert.equal(regexes.some((re) => re.test(p)), isPrivatePath(p), `regex/function disagree for ${p}`);
  }
});

test("robots.txt blocks private families, keeps public content crawlable, and does not leak a wildcard block", () => {
  const rules = robots().rules;
  const rule = Array.isArray(rules) ? rules[0] : rules;
  const disallow = ([] as string[]).concat(rule.disallow ?? []);
  assert.equal(rule.userAgent, "*");
  assert.equal(rule.allow, "/");
  for (const prefix of PRIVATE_ROUTE_PREFIXES) {
    assert.ok(disallow.includes(`${prefix}/`), `${prefix}/ must be disallowed`);
    assert.ok(disallow.includes(`${prefix}$`), `${prefix}$ must be disallowed`);
  }
  assert.ok(disallow.includes("/book/*/manage/"));
  for (const bad of ["/", "/book", "/book/", "/help", "/guides", "/watch", "/demo", "/pricing"]) {
    assert.ok(!disallow.includes(bad), `${bad} must stay crawlable`);
  }
});

test("next.config sends X-Robots-Tag on every private family", async () => {
  const rules = await nextConfig.headers!();
  for (const source of PRIVATE_HEADER_SOURCES) {
    const rule = rules.find((r) => r.source === source && r.headers.some((h) => h.key === "X-Robots-Tag"));
    assert.ok(rule, `${source} needs X-Robots-Tag`);
    assert.match(rule!.headers.find((h) => h.key === "X-Robots-Tag")!.value, /noindex/);
  }
  assert.ok(!rules.some((r) => r.source === "/:path*" && r.headers.some((h) => h.key === "X-Robots-Tag")), "must not noindex the whole site");
});

test("next.config sets Referrer-Policy same-origin (never no-referrer) on token links", async () => {
  const rules = await nextConfig.headers!();
  for (const source of TOKEN_HEADER_SOURCES) {
    const rule = rules.find((r) => r.source === source && r.headers.some((h) => h.key === "Referrer-Policy"));
    assert.ok(rule, `${source} needs Referrer-Policy`);
    assert.equal(rule!.headers.find((h) => h.key === "Referrer-Policy")!.value, "same-origin");
  }
  // `no-referrer` makes browsers send `Origin: null` on same-origin POSTs, which would break the Server Actions
  // used by quote approval and the appointment link. Guard the config and the metadata we control.
  for (const r of rules) for (const h of r.headers) assert.notEqual(h.value, "no-referrer");
  for (const file of ["src/app/quote/[token]/page.tsx", "src/app/book/[slug]/manage/[token]/page.tsx", "src/app/inspection/[token]/page.tsx"]) {
    assert.ok(!/referrer:\s*"no-referrer"/.test(read(file)), `${file} must not use no-referrer`);
  }
});

test("existing public headers are preserved", async () => {
  const rules = await nextConfig.headers!();
  assert.ok(rules.some((r) => r.source === "/video/:file*.jpg"));
  assert.ok(rules.some((r) => r.source === "/api/video/:path*" && r.headers.some((h) => h.key === "Cache-Control" && h.value === "no-store")));
});

test("every token or app page group declares noindex in its metadata", () => {
  const FILES = [
    "src/app/admin/layout.tsx",
    "src/app/platform/layout.tsx",
    "src/app/portal/layout.tsx",
    "src/app/quote/[token]/page.tsx",
    "src/app/inspection/[token]/page.tsx",
    "src/app/book/[slug]/manage/[token]/page.tsx",
  ];
  for (const file of FILES) assert.match(read(file), /robots:\s*\{\s*index:\s*false/, `${file} must declare robots noindex`);
});

test("the admin layout is a pass-through (no behavior change for login, signup or the panel)", () => {
  const src = read("src/app/admin/layout.tsx");
  assert.match(src, /return children;/);
  assert.ok(!/redirect|auth\(/.test(src));
});
