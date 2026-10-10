import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { canonicalUrl, getSiteUrl, SITE_AUTHORITY_HOST } from "../src/lib/seo/site";
import { pageMetadata } from "../src/lib/seo/metadata";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

function withEnv<T>(value: string | undefined, fn: () => T): T {
  const prev = { app: process.env.NEXT_PUBLIC_APP_URL, auth: process.env.NEXTAUTH_URL };
  if (value === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = value;
  delete process.env.NEXTAUTH_URL;
  try {
    return fn();
  } finally {
    if (prev.app === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prev.app;
    if (prev.auth !== undefined) process.env.NEXTAUTH_URL = prev.auth;
  }
}

test("canonicalUrl uses the authority host and normalizes paths", () => {
  withEnv("https://www.garage-os.ca", () => {
    assert.equal(canonicalUrl("/"), "https://www.garage-os.ca/");
    assert.equal(canonicalUrl("/help"), "https://www.garage-os.ca/help");
    assert.equal(canonicalUrl("/guides/set-up-your-shop/"), "https://www.garage-os.ca/guides/set-up-your-shop");
    assert.equal(canonicalUrl("/pricing?utm_source=x#plans"), "https://www.garage-os.ca/pricing");
    assert.equal(canonicalUrl("blog"), "https://www.garage-os.ca/blog");
  });
});

test("the apex domain is normalized to the www authority host (it 308-redirects there)", () => {
  withEnv("https://garage-os.ca", () => {
    assert.equal(getSiteUrl(), `https://${SITE_AUTHORITY_HOST}`);
    assert.equal(canonicalUrl("/features"), `https://${SITE_AUTHORITY_HOST}/features`);
  });
});

test("a trailing slash in the configured URL does not leak into canonicals", () => {
  withEnv("https://www.garage-os.ca/", () => {
    assert.equal(canonicalUrl("/product"), "https://www.garage-os.ca/product");
  });
});

test("pageMetadata gives each page its own canonical and og:url, and keeps the share image", () => {
  withEnv("https://www.garage-os.ca", () => {
    const meta = pageMetadata({ path: "/help", title: "Help", description: "Desc" });
    assert.equal(meta.alternates?.canonical, "https://www.garage-os.ca/help");
    const og = meta.openGraph as { url?: string; title?: string; images?: unknown[] };
    assert.equal(og.url, "https://www.garage-os.ca/help");
    assert.equal(og.title, "Help");
    assert.ok(Array.isArray(og.images) && og.images.length === 1, "overriding openGraph must re-declare the image");
  });
});

test("root layout must not declare a canonical or og:url (Next inherits both into every child page)", () => {
  const layout = read("src/app/(site)/layout.tsx");
  const code = layout.replace(/\/\/.*$/gm, "");
  assert.ok(!/canonical\s*:/.test(code), "layout.tsx declares alternates.canonical");
  const og = code.slice(code.indexOf("openGraph"), code.indexOf("twitter"));
  // Direct child `url:` of openGraph (4-space indent); the nested images[].url is fine.
  assert.ok(!/\n {4}url\s*:/.test(og), "layout.tsx declares openGraph.url");
});

// Public, indexable pages and the path each must declare as canonical.
const PUBLIC_PAGES: Array<[string, string]> = [
  ["src/app/(site)/page.tsx", "/"],
  ["src/app/(site)/about/page.tsx", "/about"],
  ["src/app/(site)/blog/page.tsx", "/blog"],
  ["src/app/(site)/changelog/page.tsx", "/changelog"],
  ["src/app/(site)/contact/page.tsx", "/contact"],
  ["src/app/(site)/demo/page.tsx", "/demo"],
  ["src/app/(site)/features/page.tsx", "/features"],
  ["src/app/(site)/get-started/page.tsx", "/get-started"],
  ["src/app/(site)/guides/page.tsx", "/guides"],
  ["src/app/(site)/help/page.tsx", "/help"],
  ["src/app/(site)/integrations/page.tsx", "/integrations"],
  ["src/app/(site)/pricing/page.tsx", "/pricing"],
  ["src/app/(site)/privacy/page.tsx", "/privacy"],
  ["src/app/(site)/product/page.tsx", "/product"],
  ["src/app/(site)/quick-start/page.tsx", "/quick-start"],
  ["src/app/(site)/terms/page.tsx", "/terms"],
];

for (const [file, route] of PUBLIC_PAGES) {
  test(`${route} declares its own canonical through pageMetadata()`, () => {
    const src = read(file);
    assert.match(src, /pageMetadata\(/, `${file} must call pageMetadata()`);
    assert.ok(src.includes(`path: "${route}"`), `${file} must declare path: "${route}"`);
  });
}

test("dynamic Resources pages build their canonical from the slug", () => {
  for (const base of ["guides", "blog"]) {
    const src = read(`src/app/(site)/${base}/[slug]/page.tsx`);
    assert.ok(src.includes("pageMetadata({ path: `/" + base + "/${slug}`"), `${base}/[slug] must canonicalize /${base}/<slug>`);
  }
});

test("pages that set their own canonical elsewhere keep doing so (watch, shop booking)", () => {
  assert.match(read("src/lib/watch-page.tsx"), /canonical:/);
  assert.match(read("src/app/(site)/book/[slug]/page.tsx"), /canonical:/);
});
