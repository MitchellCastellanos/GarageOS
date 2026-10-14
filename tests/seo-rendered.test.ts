/**
 * SEO CI guard. Dos capas:
 *  1. Siempre: cada ruta inglesa de la tabla tiene su page.tsx y esa página llama a pageMetadata() con su propia ruta.
 *  2. Con un build previo (`next build` → .next/server/app/*.html): title/description (longitud y unicidad), un único
 *     <h1>, canonical propio, sin noindex en páginas indexables, JSON-LD que parsea y solo en la home.
 *     Sin build, esta capa se omite (para que `npm test` siga corriendo sin compilar). Cómo ejecutarla:
 *     `next build && npx tsx --test tests/seo-rendered.test.ts`.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { BLOG_POSTS } from "../src/lib/marketing-resources";
import { HELP_ARTICLES, articlePath, categoriesFor, categoryPath } from "../src/lib/help";
import { PUBLIC_ROUTES } from "../src/lib/seo/routes";

const root = process.cwd();
const PAGES = path.join(root, "src/app/(site)");
const BUILT = path.join(root, ".next/server/app");

const enPaths = [
  ...PUBLIC_ROUTES.filter((r) => !r.redirectTo).map((r) => r.en),
  ...BLOG_POSTS.map((b) => `/blog/${b.slug}`),
  ...categoriesFor("en").map((c) => categoryPath("en", c)),
  ...HELP_ARTICLES.map((a) => articlePath("en", a)!),
];
const canonicalOf = (p: string): string => p;

function pageFile(routePath: string): string {
  if (routePath.startsWith("/help/")) {
    const depth = routePath.split("/").length - 2; // /help/<c> = 1, /help/<c>/<s> = 2
    return path.join(PAGES, "help", depth === 1 ? "[category]" : "[category]/[slug]", "page.tsx");
  }
  const dir = routePath === "/" ? "" : routePath.replace(/^\//, "");
  const direct = path.join(PAGES, dir, "page.tsx");
  if (fs.existsSync(direct)) return direct;
  const parts = dir.split("/");
  const slug = parts.pop()!;
  void slug;
  return path.join(PAGES, parts.join("/"), "[slug]", "page.tsx");
}

test("every public EN route has a page that calls pageMetadata() with its own path", () => {
  for (const routePath of enPaths) {
    const file = pageFile(routePath);
    assert.ok(fs.existsSync(file), `${routePath}: missing ${file}`);
    const src = fs.readFileSync(file, "utf8");
    assert.match(src, /pageMetadata\(/, `${routePath}: page does not use pageMetadata()`);
    if (!routePath.startsWith("/blog/") && !routePath.startsWith("/help/") && !routePath.startsWith("/features/")) {
      assert.ok(src.includes(`path: "${routePath}"`), `${routePath}: pageMetadata path must be "${routePath}"`);
    }
  }
});

test("EN pages do not carry bilingual 'EN · FR' metadata strings", () => {
  for (const routePath of enPaths) {
    const src = fs.readFileSync(pageFile(routePath), "utf8");
    const meta = src.split("pageMetadata(")[1]?.split(");")[0] ?? "";
    assert.ok(!/(title|description):\s*"[^"]*\s·\s[^"]*"/.test(meta), `${routePath}: metadata mixes languages`);
  }
});

const built = fs.existsSync(BUILT);
const htmlOf = (routePath: string): string | null => {
  const rel = routePath === "/" ? "index.html" : `${routePath.replace(/^\//, "")}.html`;
  const file = path.join(BUILT, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
};
const first = (html: string, re: RegExp) => html.match(re)?.[1] ?? "";
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

test("rendered HTML: metadata, single H1, canonical, indexability, JSON-LD", { skip: !built && "run `next build` first" }, () => {
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();
  let checked = 0;
  for (const routePath of enPaths) {
    const html = htmlOf(routePath);
    assert.ok(html, `${routePath}: no prerendered HTML in .next/server/app`);
    checked++;

    const title = decode(first(html, /<title>([^<]*)<\/title>/));
    const description = decode(first(html, /<meta name="description" content="([^"]*)"/));
    assert.ok(title.length >= 8 && title.length <= 70, `${routePath}: title length ${title.length} ("${title}")`);
    assert.ok(description.length >= 50 && description.length <= 160, `${routePath}: description length ${description.length}`);
    // Una página no canónica (guía → artículo de ayuda) comparte metadata con su original por diseño.
    if (canonicalOf(routePath) === routePath) {
      assert.ok(!titles.has(title), `${routePath}: duplicate title with ${titles.get(title)}`);
      assert.ok(!descriptions.has(description), `${routePath}: duplicate description with ${descriptions.get(description)}`);
      titles.set(title, routePath);
      descriptions.set(description, routePath);
    }

    const h1s = [...html.matchAll(/<h1[\s>][\s\S]*?<\/h1>/g)];
    assert.equal(h1s.length, 1, `${routePath}: expected exactly one <h1>, found ${h1s.length}`);
    assert.ok(h1s[0][0].replace(/<[^>]+>/g, "").trim().length > 0, `${routePath}: empty <h1>`);

    const canonical = first(html, /<link rel="canonical" href="([^"]*)"/);
    assert.ok(canonical, `${routePath}: no canonical`);
    const canonicalPath = new URL(canonical).pathname;
    assert.equal(canonicalPath.replace(/\/$/, "") || "/", canonicalOf(routePath), `${routePath}: canonical points elsewhere (${canonical})`);
    assert.equal(first(html, /<meta property="og:url" content="([^"]*)"/), canonical, `${routePath}: og:url != canonical`);

    assert.ok(!/<meta name="robots" content="[^"]*noindex/.test(html), `${routePath}: indexable page is noindex`);

    const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
    const isHelp = routePath.startsWith("/help/") || routePath.startsWith("/features/"); // BreadcrumbList pages
    if (routePath !== "/" && !isHelp) assert.equal(blocks.length, 0, `${routePath}: unexpected JSON-LD`);
    if (isHelp) assert.equal(blocks.length, 1, `${routePath}: expected one BreadcrumbList`);
    for (const b of blocks) {
      const data = JSON.parse(b[1].replace(/\\u003c/g, "<"));
      for (const item of Array.isArray(data) ? data : [data]) {
        assert.equal(item["@context"], "https://schema.org");
        assert.ok((isHelp ? ["BreadcrumbList"] : ["Organization", "WebSite"]).includes(item["@type"]), `${routePath}: JSON-LD type ${item["@type"]} not allowed yet`);
        assert.ok(!("aggregateRating" in item) && !("review" in item) && !("offers" in item), "JSON-LD must not claim ratings, reviews or offers");
      }
    }
  }
  assert.equal(checked, enPaths.length);
});
