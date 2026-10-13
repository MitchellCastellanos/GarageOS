import assert from "node:assert/strict";
import test from "node:test";
import robots from "../src/app/robots";
import { isPrivatePath, isTokenPath, PRIVATE_ROUTE_PREFIXES } from "../src/lib/privacy/private-paths";
import { createRouter, isIndexablePath, PUBLIC_ROUTES, ROUTE_FAMILIES, type PublicRoute } from "../src/lib/seo/routes";
import { jsonLdString, organizationJsonLd, webSiteJsonLd } from "../src/lib/seo/json-ld";
import { pageMetadata } from "../src/lib/seo/metadata";
import { buildSitemapEntries } from "../src/lib/seo/sitemap-entries";
import { alternatesFor } from "../src/lib/seo/site";

const HOST = "https://www.garage-os.ca";

function withEnv<T>(value: string, fn: () => T): T {
  const prev = { app: process.env.NEXT_PUBLIC_APP_URL, auth: process.env.NEXTAUTH_URL };
  process.env.NEXT_PUBLIC_APP_URL = value;
  delete process.env.NEXTAUTH_URL;
  try {
    return fn();
  } finally {
    if (prev.app === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prev.app;
    if (prev.auth !== undefined) process.env.NEXTAUTH_URL = prev.auth;
  }
}

test("sitemap excludes private, token, /book, /watch, noindex and query URLs", () => {
  const entries = withEnv(HOST, buildSitemapEntries);
  assert.ok(entries.length > 10);
  for (const { url } of entries) {
    const path = new URL(url).pathname;
    assert.ok(!isPrivatePath(path) && !isTokenPath(path), url);
    assert.ok(!path.startsWith("/book") && !path.startsWith("/watch"), url);
    assert.ok(!url.includes("?"), url);
    assert.ok(isIndexablePath(path), url);
    for (const prefix of PRIVATE_ROUTE_PREFIXES) assert.ok(path !== prefix && !path.startsWith(`${prefix}/`), url);
  }
});

test("sitemap uses the authority host (apex is normalized) and has no duplicates", () => {
  for (const env of [HOST, "https://garage-os.ca"]) {
    const urls = withEnv(env, buildSitemapEntries).map((e) => e.url);
    assert.ok(urls.every((u) => u.startsWith(`${HOST}/`) || u === HOST), env);
    assert.equal(new Set(urls).size, urls.length);
  }
});

test("sitemap includes EN pages and guide/blog children but no French URL today (/fr is noindex)", () => {
  const urls = withEnv(HOST, buildSitemapEntries).map((e) => e.url);
  assert.ok(urls.includes(`${HOST}/`));
  assert.ok(urls.includes(`${HOST}/pricing`));
  assert.ok(urls.some((u) => u.startsWith(`${HOST}/help/`) && u.split("/").length === 6), "Help articles are listed");
  assert.ok(!urls.some((u) => u.startsWith(`${HOST}/guides/`)), "guides canonicalise to Help articles");
  assert.ok(urls.some((u) => u.startsWith(`${HOST}/blog/`)));
  assert.ok(!urls.some((u) => new URL(u).pathname === "/fr" || new URL(u).pathname.startsWith("/fr/")));
});

test("pages without a live FR equivalent emit no hreflang", () => {
  withEnv(HOST, () => {
    for (const route of PUBLIC_ROUTES) {
      assert.equal(alternatesFor(route.en), undefined, route.en);
      assert.equal(alternatesFor(route.fr ?? "/nope"), undefined);
      assert.equal(pageMetadata({ path: route.en, title: "t", description: "d" }).alternates?.languages, undefined);
    }
    assert.equal(alternatesFor("/guides/anything"), undefined);
  });
  for (const entry of withEnv(HOST, buildSitemapEntries)) assert.equal(entry.alternates, undefined);
});

test("hreflang: reciprocal, self-canonical, x-default is EN, only for live+indexable pairs", () => {
  const table: PublicRoute[] = [
    { id: "home", en: "/", fr: "/fr", frStatus: "live", frIndexable: false },
    { id: "pricing", en: "/pricing", fr: "/fr/tarifs", frStatus: "live" },
    { id: "demo", en: "/demo", fr: "/fr/demo", frStatus: "planned", parent: "home" },
    { id: "blog", en: "/blog", frStatus: "none", parent: "home" },
  ];
  const router = createRouter(table, ROUTE_FAMILIES);
  assert.equal(router.hreflangPaths("/"), undefined); // FR noindex
  assert.equal(router.hreflangPaths("/demo"), undefined); // planned
  assert.equal(router.hreflangPaths("/blog"), undefined);
  assert.equal(router.hreflangPaths("/blog/x"), undefined); // child
  const fromEn = router.hreflangPaths("/pricing");
  const fromFr = router.hreflangPaths("/fr/tarifs");
  assert.deepEqual(fromEn, { "en-CA": "/pricing", "fr-CA": "/fr/tarifs", "x-default": "/pricing" });
  assert.deepEqual(fromFr, fromEn); // reciprocity
  assert.ok(router.isIndexablePath("/fr/tarifs"));
});

test("robots.txt has the Sitemap line and keeps every Disallow", () => {
  const result = withEnv(HOST, robots);
  assert.equal(result.sitemap, `${HOST}/sitemap.xml`);
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
  const disallow = rules.flatMap((r) => (Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : []));
  for (const prefix of PRIVATE_ROUTE_PREFIXES) {
    assert.ok(disallow.includes(`${prefix}/`) && disallow.includes(`${prefix}$`), prefix);
  }
  assert.ok(disallow.includes("/book/*/manage/"));
});

test("JSON-LD parses and only has the allowed fields", () => {
  withEnv(HOST, () => {
    const org = JSON.parse(jsonLdString(organizationJsonLd()));
    assert.deepEqual(Object.keys(org).sort(), ["@context", "@type", "logo", "name", "url"]);
    assert.equal(org.url, HOST);
    const site = JSON.parse(jsonLdString(webSiteJsonLd("en")));
    assert.deepEqual(Object.keys(site).sort(), ["@context", "@type", "inLanguage", "name", "url"]);
    assert.equal(site.inLanguage, "en-CA");
    assert.ok(!jsonLdString({ a: "</script>" }).includes("</script>"));
  });
});
