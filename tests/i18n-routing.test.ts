import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  PUBLIC_ROUTES,
  ROUTE_FAMILIES,
  cleanPath,
  createRouter,
  fixedLocaleForPath,
  isFrenchPath,
  isIndexablePath,
  localizeHref,
  matchRoute,
  switchTarget,
  type PublicRoute,
} from "../src/lib/seo/routes";
import { pageMetadata } from "../src/lib/seo/metadata";
import { HTML_LANG } from "../src/lib/seo/html-lang";
import { isPrivatePath } from "../src/lib/privacy/private-paths";

const root = process.cwd();
const exists = (rel: string) => fs.existsSync(path.join(root, rel));
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

// ── Route table ────────────────────────────────────────────────────────────────────────────────────────────────

test("approved French slugs", () => {
  const fr = Object.fromEntries(PUBLIC_ROUTES.filter((r) => r.fr).map((r) => [r.id, r.fr]));
  assert.deepEqual(fr, {
    home: "/fr",
    product: "/fr/produit",
    features: "/fr/fonctionnalites",
    pricing: "/fr/tarifs",
    integrations: "/fr/integrations",
    demo: "/fr/demo",
    getStarted: "/fr/commencer",
    quickStart: "/fr/demarrage-rapide",
    about: "/fr/a-propos",
    contact: "/fr/contact",
    privacy: "/fr/confidentialite",
    terms: "/fr/conditions",
    changelog: "/fr/nouveautes",
    help: "/fr/aide",
  });
});

test("route table is well-formed: unique ids and paths, clean slugs, EN under no prefix, FR under /fr", () => {
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const r of PUBLIC_ROUTES) {
    assert.ok(!ids.has(r.id), `duplicate id ${r.id}`);
    ids.add(r.id);
    assert.ok(r.en.startsWith("/") && !isFrenchPath(r.en), `${r.id}: EN path must be unprefixed`);
    assert.equal(cleanPath(r.en), r.en, `${r.id}: EN path must be clean`);
    for (const p of [r.en, r.fr].filter(Boolean) as string[]) {
      assert.ok(!paths.has(p), `duplicate path ${p}`);
      paths.add(p);
      assert.match(p, /^\/[a-z0-9/-]*$/, `${p}: lowercase ASCII slug only (no accents, spaces or underscores)`);
      assert.ok(!isPrivatePath(p), `${p}: a public page cannot be a private path`);
    }
    if (r.fr) {
      assert.ok(isFrenchPath(r.fr), `${r.id}: FR path must live under /fr`);
      assert.notEqual(r.frStatus, "none");
    } else assert.equal(r.frStatus, "none", `${r.id}: no FR path means status none`);
  }
});

test("every parent exists and parent chains end (no cycles)", () => {
  const byId = new Map(PUBLIC_ROUTES.map((r) => [r.id, r]));
  for (const r of PUBLIC_ROUTES) {
    const seen = new Set<string>([r.id]);
    let cur = r.parent ? byId.get(r.parent) : undefined;
    if (r.parent) assert.ok(cur, `${r.id}: unknown parent ${r.parent}`);
    while (cur) {
      assert.ok(!seen.has(cur.id), `${r.id}: parent cycle through ${cur.id}`);
      seen.add(cur.id);
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
  }
  for (const f of ROUTE_FAMILIES) assert.ok(byId.has(f.routeId), `family ${f.prefix} points to unknown route`);
});

test("route files exist: every EN page, and every FR page marked live", () => {
  for (const r of PUBLIC_ROUTES) {
    const en = r.en === "/" ? "src/app/(site)/page.tsx" : `src/app/(site)${r.en}/page.tsx`;
    assert.ok(exists(en), `${r.id}: missing ${en}`);
    if (r.frStatus === "live") {
      const fr = `src/app/(fr)${r.fr}/page.tsx`;
      assert.ok(exists(fr), `${r.id}: marked live but missing ${fr}`);
    }
  }
  // Conversely: a page file under (fr) must be registered as live, so the language switcher can find it.
  const registered = new Set(PUBLIC_ROUTES.filter((r) => r.frStatus === "live").map((r) => `src/app/(fr)${r.fr}/page.tsx`));
  for (const f of walk("src/app/(fr)").filter((f) => f.endsWith("/page.tsx"))) assert.ok(registered.has(f), `${f} is not registered as live in PUBLIC_ROUTES`);
});

// ── Matching, switching, fallback ───────────────────────────────────────────────────────────────────────────────

test("matchRoute / fixedLocaleForPath", () => {
  assert.equal(matchRoute("/")?.route.id, "home");
  assert.equal(matchRoute("/fr")?.locale, "fr");
  assert.equal(matchRoute("/fr/")?.route.id, "home");
  assert.equal(matchRoute("/pricing?utm_source=x#plans")?.route.id, "pricing");
  assert.equal(matchRoute("/fr/tarifs")?.route.id, "pricing");
  assert.equal(matchRoute("/guides/set-up-your-shop")?.child, true);
  assert.equal(matchRoute("/admin/login"), null);
  assert.equal(matchRoute("/guidesx"), null);
  assert.equal(fixedLocaleForPath("/pricing"), "en");
  assert.equal(fixedLocaleForPath("/fr/anything"), "fr");
  assert.equal(fixedLocaleForPath("/admin/login"), null, "login/signup keep a user preference");
  assert.equal(fixedLocaleForPath("/admin/signup"), null);
});

test("language switch: exact equivalent when it exists", () => {
  assert.deepEqual(switchTarget("/", "fr"), { kind: "link", href: "/fr", fallback: false });
  assert.deepEqual(switchTarget("/fr", "en"), { kind: "link", href: "/", fallback: false });
  assert.deepEqual(switchTarget("/", "en"), { kind: "current" });
  assert.deepEqual(switchTarget("/fr", "fr"), { kind: "current" });
});

test("language switch: explicit fallback to the nearest existing ancestor, then to the home", () => {
  // Today only the French home is live: planned pages fall back to it, flagged as a fallback.
  assert.deepEqual(switchTarget("/pricing", "fr"), { kind: "link", href: "/fr", fallback: true });
  assert.deepEqual(switchTarget("/guides/set-up-your-shop", "fr"), { kind: "link", href: "/fr", fallback: true });
  // A French page that is not registered yet goes back to the English home.
  assert.deepEqual(switchTarget("/fr/whatever", "en"), { kind: "link", href: "/", fallback: true });
  assert.deepEqual(switchTarget("/fr/whatever", "fr"), { kind: "current" });
  // Unregistered, non-French routes (login, signup…) switch language in place.
  assert.deepEqual(switchTarget("/admin/login", "fr"), { kind: "inplace" });
});

const live = (id: string, extra: Partial<PublicRoute> = {}): PublicRoute => ({ ...PUBLIC_ROUTES.find((r) => r.id === id)!, frStatus: "live", ...extra });
const withLive = (ids: string[]) => PUBLIC_ROUTES.map((r) => (ids.includes(r.id) ? live(r.id) : r));

test("language switch with more French pages live: exact match wins, then the ancestor chain", () => {
  const r = createRouter(withLive(["home", "help", "pricing"]), ROUTE_FAMILIES);
  assert.deepEqual(r.switchTarget("/pricing", "fr"), { kind: "link", href: "/fr/tarifs", fallback: false });
  assert.deepEqual(r.switchTarget("/fr/tarifs", "en"), { kind: "link", href: "/pricing", fallback: false });
  // guides has no FR page: its ancestor (help) is live, so the fallback is the French help center.
  assert.deepEqual(r.switchTarget("/guides/set-up-your-shop", "fr"), { kind: "link", href: "/fr/aide", fallback: true });
  assert.deepEqual(r.switchTarget("/guides", "fr"), { kind: "link", href: "/fr/aide", fallback: true });
  // quickStart (planned) → parent help (live)
  assert.deepEqual(r.switchTarget("/quick-start", "fr"), { kind: "link", href: "/fr/aide", fallback: true });
  // blog has no help parent: falls to home
  assert.deepEqual(r.switchTarget("/blog/x", "fr"), { kind: "link", href: "/fr", fallback: true });
});

test("a child page never reuses its parent's exact route (a guide is not the guides index)", () => {
  const routes: PublicRoute[] = [
    { id: "home", en: "/", fr: "/fr", frStatus: "live" },
    { id: "guides", en: "/guides", fr: "/fr/guides", frStatus: "live", parent: "home" },
  ];
  const r = createRouter(routes, [{ prefix: "/guides/", routeId: "guides" }]);
  assert.deepEqual(r.switchTarget("/guides", "fr"), { kind: "link", href: "/fr/guides", fallback: false });
  assert.deepEqual(r.switchTarget("/guides/a-guide", "fr"), { kind: "link", href: "/fr/guides", fallback: true });
});

test("a parent cycle cannot hang the switcher", () => {
  const routes: PublicRoute[] = [
    { id: "home", en: "/", fr: "/fr", frStatus: "planned" },
    { id: "a", en: "/a", frStatus: "none", parent: "b" },
    { id: "b", en: "/b", frStatus: "none", parent: "a" },
  ];
  const r = createRouter(routes, []);
  assert.deepEqual(r.switchTarget("/a", "fr"), { kind: "link", href: "/fr", fallback: true });
});

test("localizeHref only rewrites links whose French page is live", () => {
  assert.equal(localizeHref("/", "fr"), "/fr");
  assert.equal(localizeHref("/pricing", "fr"), "/pricing", "planned page: keep the English URL, never invent one");
  assert.equal(localizeHref("/pricing", "en"), "/pricing");
  assert.equal(localizeHref("/admin/login", "fr"), "/admin/login");
  assert.equal(localizeHref("//evil.example/x", "fr"), "//evil.example/x");
  assert.equal(localizeHref("https://example.com/", "fr"), "https://example.com/");
  const r = createRouter(withLive(["home", "pricing"]), ROUTE_FAMILIES);
  assert.equal(r.localizeHref("/pricing", "fr"), "/fr/tarifs");
  assert.equal(r.localizeHref("/pricing#plans", "fr"), "/fr/tarifs#plans");
  assert.equal(r.localizeHref("/pricing?x=1", "fr"), "/fr/tarifs?x=1");
  assert.equal(r.localizeHref("/pricing/", "fr"), "/fr/tarifs");
});

// ── Indexability and metadata ───────────────────────────────────────────────────────────────────────────────────

test("the pilot French home stays out of search engines until the sitemap and hreflang PR flips it", () => {
  assert.equal(isIndexablePath("/"), true);
  assert.equal(isIndexablePath("/fr"), false);
  const fr = pageMetadata({ path: "/fr", title: "T", description: "D" });
  assert.deepEqual(fr.robots, { index: false, follow: true });
  assert.equal((fr.openGraph as { locale?: string }).locale, "fr_CA");
  const en = pageMetadata({ path: "/", title: "T", description: "D" });
  assert.equal(en.robots, undefined);
  assert.equal((en.openGraph as { locale?: string }).locale, "en_CA");
  const r = createRouter(PUBLIC_ROUTES.map((x) => (x.id === "home" ? { ...x, frIndexable: true } : x)), ROUTE_FAMILIES);
  assert.equal(r.isIndexablePath("/fr"), true);
});

// ── Root layouts ───────────────────────────────────────────────────────────────────────────────────────────────

test("two root layouts, one <html lang> each; nothing at the top of src/app can need a root layout", () => {
  assert.equal(HTML_LANG.en, "en");
  assert.equal(HTML_LANG.fr, "fr-CA");
  assert.ok(!exists("src/app/layout.tsx"), "a top-level layout would nest the two root layouts");
  assert.ok(!exists("src/app/page.tsx"), "pages must live inside a route group with a root layout");
  assert.match(read("src/app/(site)/layout.tsx"), /<RootShell locale="en">/);
  assert.match(read("src/app/(fr)/layout.tsx"), /<RootShell locale="fr">/);
  assert.match(read("src/app/(site)/layout.tsx"), /rootMetadata\("en"\)/);
  assert.match(read("src/app/(fr)/layout.tsx"), /rootMetadata\("fr"\)/);
  assert.match(read("src/components/root/RootShell.tsx"), /<html lang=\{HTML_LANG\[locale\]\}/);
  // Only route handlers and metadata files stay outside the groups.
  const top = fs.readdirSync(path.join(root, "src/app"));
  assert.deepEqual(top.sort(), ["(fr)", "(site)", "api", "apple-icon.png", "globals.css", "icon.png", "robots.ts"].sort());
  for (const f of walk("src/app/api")) assert.ok(!/\/(page|layout)\.tsx$/.test(f), `${f}: api must hold route handlers only`);
});

test("French tree: every file is under (fr)/fr or is the layout", () => {
  for (const f of walk("src/app/(fr)")) assert.ok(f === "src/app/(fr)/layout.tsx" || f.startsWith("src/app/(fr)/fr/"), `${f} must live under (fr)/fr`);
});

test("analytics reports the language of the URL, not a constant", () => {
  const beacon = read("src/components/AnalyticsBeacon.tsx");
  assert.match(beacon, /locale: isFrenchPath\(pathname\) \? "fr" : "en"/);
});

test("the provider does not sniff the browser language on routes whose URL fixes the language", () => {
  const provider = read("src/components/marketing/MarketingLocaleProvider.tsx");
  const effect = provider.slice(provider.indexOf("useEffect(() => {"), provider.indexOf("const locale = fixed ?? preferred"));
  assert.match(effect, /if \(fixed\) return;/, "language detection must be skipped when the URL fixes the language");
  assert.ok(!/redirect|router\.(push|replace)|location\.(href|assign|replace)/.test(provider), "no automatic redirects");
});

test("the language switcher is a real link on public pages, with accessible names and language attributes", () => {
  const toggle = read("src/components/marketing/LanguageToggle.tsx");
  assert.match(toggle, /<a\s/);
  assert.match(toggle, /hrefLang=/);
  assert.match(toggle, /aria-current="true"/);
  assert.match(toggle, /aria-label="Language · Langue"/);
  assert.ok(!/NEXT_PUBLIC|navigator\./.test(toggle));
});
