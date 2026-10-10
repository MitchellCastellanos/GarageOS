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
  looksLikeToken,
  normalizeForMatching,
  normalizeForStorage,
  privatePathRegexSources,
  sanitizeCampaignValue,
  shopSlugFromPath,
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
  for (const file of ["src/app/(site)/quote/[token]/page.tsx", "src/app/(site)/book/[slug]/manage/[token]/page.tsx", "src/app/(site)/inspection/[token]/page.tsx"]) {
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
    "src/app/(site)/admin/layout.tsx",
    "src/app/(site)/platform/layout.tsx",
    "src/app/(site)/portal/layout.tsx",
    "src/app/(site)/quote/[token]/page.tsx",
    "src/app/(site)/inspection/[token]/page.tsx",
    "src/app/(site)/book/[slug]/manage/[token]/page.tsx",
  ];
  for (const file of FILES) assert.match(read(file), /robots:\s*\{\s*index:\s*false/, `${file} must declare robots noindex`);
});

test("the admin layout is a pass-through (no behavior change for login, signup or the panel)", () => {
  const src = read("src/app/(site)/admin/layout.tsx");
  assert.match(src, /return children;/);
  assert.ok(!/redirect|auth\(/.test(src));
});

// ── Variants: the same private route written differently must be classified the same way ──────────────────────

const PRIVATE_VARIANTS = [
  "/PORTAL/tokenvalue", // case
  "/Quote/tokenvalue",
  "/portal/tokenvalue/", // trailing slash
  "//portal/tokenvalue", // repeated slashes
  "/portal//tokenvalue",
  "///quote///tokenvalue",
  "\\portal\\tokenvalue", // backslashes
  "/%70ortal/tokenvalue", // percent-encoded letter
  "/%51uote/tokenvalue",
  "/%2570ortal/tokenvalue", // double-encoded
  "/%252570ortal/tokenvalue", // triple-encoded
  "/portal%2Ftokenvalue", // encoded slash
  "/portal%2ftokenvalue",
  "/x/../portal/tokenvalue", // dot segments
  "/./portal/tokenvalue",
  "/portal/./tokenvalue",
  "/portal/tokenvalue?utm_source=x", // query
  "/portal/tokenvalue#frag", // hash
  "/portal%3Ftokenvalue", // encoded ?
  "/portal%23tokenvalue", // encoded #
  "/quote/tokenvalue\u0000", // control chars
  "/book/shop/manage/tokenvalue/",
  "/BOOK/shop/MANAGE/tokenvalue",
  "/book/shop//manage//tokenvalue",
  "/book/sh%6Fp/manage/tokenvalue",
  "/book/shop/%6Danage/tokenvalue",
  "/api/track?x=1",
  "/admin/../admin/dashboard",
  "/ADMIN/login",
  "/sales-invite/staff1/",
  "/%73ales/book/tokenvalue",
];

test("variants of private routes (case, encoding, slashes, dot segments, query) are all private and untracked", () => {
  for (const p of PRIVATE_VARIANTS) {
    assert.equal(isPrivatePath(p), true, `${JSON.stringify(p)} must be private`);
    assert.equal(isTrackablePath(p), false, `${JSON.stringify(p)} must not be tracked`);
  }
});

test("token-bearing variants are token paths (Referer policy family)", () => {
  for (const p of ["/PORTAL/t", "/%70ortal/t", "//quote/t", "/x/../inspection/t", "/book/s/MANAGE/t"]) {
    assert.equal(isTokenPath(p), true, p);
  }
});

test("unparseable paths are treated as private and never tracked", () => {
  for (const p of ["", "%E0%A4%A", "/portal/%E0%A4%A", "/a/%zz", "/" + "a".repeat(3000), "/%25%25%25%25%25"]) {
    assert.equal(isPrivatePath(p), true, `${JSON.stringify(p.slice(0, 20))} must be treated as private`);
    assert.equal(isTrackablePath(p), false);
  }
  assert.equal(normalizeForMatching("%E0%A4%A"), null);
});

test("public look-alikes survive normalization", () => {
  for (const p of ["/help", "/HELP", "/help/", "/help?q=%70ortal", "/guides/set-up-your-shop#portal", "/book/some-shop", "/book/some-shop/?embed=1", "/watch/en?t=tokenvalue", "/quote-software", "/portal-features", "/%71uote-software"]) {
    assert.equal(isPrivatePath(p), false, `${p} must stay public`);
  }
  // A token in the query of a public page is never part of the path that is classified or stored.
  assert.equal(normalizeForStorage("/watch/en?t=tokenvalue"), "/watch/en");
});

test("stored paths carry no query, hash, control characters, repeated slashes or dot segments", () => {
  assert.equal(normalizeForStorage("/help?x=1#y"), "/help");
  assert.equal(normalizeForStorage("//help//"), "/help");
  assert.equal(normalizeForStorage("/a/../help"), "/help");
  assert.equal(normalizeForStorage("/he\u0000lp"), "/help");
  assert.equal(normalizeForStorage("help"), null);
  assert.equal(normalizeForStorage(""), null);
  assert.equal(normalizeForStorage("/Pricing"), "/Pricing", "case is preserved for display");
});

test("campaign fields never keep a token-shaped value", () => {
  assert.equal(sanitizeCampaignValue("newsletter"), "newsletter");
  assert.equal(sanitizeCampaignValue("fall-2026_promo"), "fall-2026_promo");
  assert.equal(sanitizeCampaignValue("a".repeat(24)), "");
  assert.equal(sanitizeCampaignValue("spring AbCdEfGhIjKlMnOpQrStUvWxYz012345 sale"), "");
  assert.equal(sanitizeCampaignValue(undefined), "");
  assert.equal(sanitizeCampaignValue(42), "");
  assert.equal(sanitizeCampaignValue("x".repeat(500)).length, 0, "500 url-safe characters is token-shaped");
  assert.ok(looksLikeToken("0123456789abcdef0123456789abcdef"));
  assert.ok(!looksLikeToken("garage-laurent-demo"));
});

test("the shop slug is derived from the stored path, validated, and never taken from the request body", () => {
  assert.equal(shopSlugFromPath("/book/garage-laurent-demo"), "garage-laurent-demo");
  assert.equal(shopSlugFromPath("/book/garage-laurent-demo/anything"), "garage-laurent-demo");
  assert.equal(shopSlugFromPath("/help"), "");
  assert.equal(shopSlugFromPath("/book/" + "a".repeat(40)), "", "token-shaped slugs are dropped");
  assert.equal(shopSlugFromPath("/book/Bad_Slug!"), "");
  const server = read("src/lib/platform/analytics.ts");
  assert.ok(!/input\.shopSlug/.test(server), "trackPageView must not trust input.shopSlug");
  assert.ok(!/input\.utm(Source|Medium|Campaign)\.slice/.test(server), "utm_* must go through sanitizeCampaignValue");
  assert.match(server, /path:\s*path\.slice\(0, 300\)/, "the normalized path is what gets stored");
  assert.ok(!/input\.path\.slice/.test(server), "the raw client path must not be stored");
});

test("no sitemap or public metadata exposes private routes", () => {
  // No sitemap exists yet; when one is added it must filter with the shared rule.
  if (fs.existsSync(path.join(root, "src/app/(site)/sitemap.ts"))) {
    assert.match(read("src/app/(site)/sitemap.ts"), /isPrivatePath/, "sitemap.ts must filter URLs with isPrivatePath");
  }
  // The video page canonicalizes the clean URL; the attribution token travels in the query and is never in metadata.
  const watch = read("src/lib/watch-page.tsx");
  assert.match(watch, /robots: token \? \{ index: false, follow: false \}/);
  assert.ok(!/canonical:[^\n]*\?t=/.test(watch));
  // Public pages that set canonical/OG go through the helper, which only ever receives literal public paths.
  const helper = read("src/lib/seo/metadata.ts");
  assert.ok(!/token/i.test(helper.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
});
