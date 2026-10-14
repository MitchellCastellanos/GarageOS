import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { GUIDES } from "../src/lib/marketing-resources";
import {
  HELP_ARTICLES, HELP_CATEGORIES, articlePath, articlesFor, breadcrumbsFor, buildSearchIndex, categoriesFor, categoryPath,
  findArticle, findCategory, helpPathForGuide, relatedFor, type HelpArticle,
} from "../src/lib/help";
import { LEGACY_GUIDE_REDIRECTS } from "../src/lib/help/legacy-redirects";
import { normalizeText, searchHelp } from "../src/lib/help/search";
import { isIndexablePath } from "../src/lib/seo/routes";
import { buildSitemapEntries } from "../src/lib/seo/sitemap-entries";
import { breadcrumbJsonLd, jsonLdString } from "../src/lib/seo/json-ld";
import { pageMetadata } from "../src/lib/seo/metadata";

const HOST = "https://www.garage-os.ca";
function withEnv<T>(fn: () => T): T {
  const prev = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = HOST;
  try { return fn(); } finally { if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = prev; }
}

test("every existing guide has an equivalent Help article (complete equivalence map)", () => {
  assert.equal(HELP_ARTICLES.length, GUIDES.length);
  const targets = new Set<string>();
  for (const guide of GUIDES) {
    const target = helpPathForGuide(guide.slug);
    assert.ok(target && /^\/help\/[a-z-]+\/[a-z-]+$/.test(target), `${guide.slug}: no Help destination`);
    assert.ok(!targets.has(target), `${guide.slug}: duplicate destination ${target}`);
    targets.add(target);
  }
  assert.equal(helpPathForGuide("does-not-exist"), null);
});

test("Help content is the guide content (no duplicated text) and article ids/slugs are unique", () => {
  for (const guide of GUIDES) {
    const article = HELP_ARTICLES.find((a) => a.legacyGuide === guide.slug)!;
    assert.equal(article.content.en?.title, guide.title);
    assert.deepEqual(article.content.en?.sections, guide.sections);
  }
  assert.equal(new Set(HELP_ARTICLES.map((a) => a.id)).size, HELP_ARTICLES.length);
  for (const locale of ["en", "fr"] as const) {
    const slugs = HELP_CATEGORIES.map((c) => c.slug[locale]);
    assert.equal(new Set(slugs).size, slugs.length, `${locale} category slugs unique`);
    for (const c of HELP_CATEGORIES) assert.ok(c.name[locale] && c.description[locale]);
  }
});

test("paths, lookup and breadcrumbs (EN)", () => {
  const article = findArticle("en", "getting-started", "set-up-your-shop")!;
  assert.ok(article);
  assert.equal(articlePath("en", article), "/help/getting-started/set-up-your-shop");
  assert.equal(findArticle("en", "run-the-shop", "set-up-your-shop"), undefined, "wrong category");
  const category = findCategory("en", "getting-started")!;
  assert.equal(categoryPath("en", category), "/help/getting-started");
  const crumbs = breadcrumbsFor("en", category, article);
  assert.deepEqual(crumbs.map((c) => c.href), ["/", "/help", "/help/getting-started", "/help/getting-started/set-up-your-shop"]);
  const ld = JSON.parse(jsonLdString(withEnv(() => breadcrumbJsonLd(crumbs))));
  assert.equal(ld["@type"], "BreadcrumbList");
  assert.equal(ld.itemListElement[3].item, `${HOST}/help/getting-started/set-up-your-shop`);
});

test("related articles exist, exclude the article itself and are capped at 3", () => {
  for (const article of articlesFor("en")) {
    const related = relatedFor("en", article);
    assert.ok(related.length >= 1 && related.length <= 3, article.id);
    assert.ok(related.every((r) => r.id !== article.id && articlePath("en", r)), article.id);
  }
});

test("French is supported by the model but empty today: no FR paths, categories, search entries or sitemap URLs", () => {
  assert.deepEqual(categoriesFor("fr"), []);
  assert.deepEqual(buildSearchIndex("fr"), []);
  assert.equal(articlePath("fr", HELP_ARTICLES[0]), null);
  const urls = withEnv(() => buildSitemapEntries()).map((e) => new URL(e.url).pathname);
  assert.ok(!urls.some((u) => u.startsWith("/fr")));
});

test("a French article fixture gets /fr/aide/<categorie>/<slug>, FR breadcrumbs, FR search entry and stays noindex", () => {
  const fixture: HelpArticle[] = [{
    id: "demo", category: "getting-started", slug: { en: "demo", fr: "exemple" },
    content: { en: { title: "Demo", summary: "S", sections: [] }, fr: { title: "Exemple", summary: "Résumé", sections: [{ title: "Titre", body: "Texte de recherche" }] } },
  }];
  const a = fixture[0];
  assert.equal(articlePath("fr", a), "/fr/aide/premiers-pas/exemple");
  assert.equal(findArticle("fr", "premiers-pas", "exemple", fixture)?.id, "demo");
  const category = findCategory("fr", "premiers-pas", fixture)!;
  assert.deepEqual(breadcrumbsFor("fr", category, a).map((c) => c.href), ["/fr", "/fr/aide", "/fr/aide/premiers-pas", "/fr/aide/premiers-pas/exemple"]);
  const index = buildSearchIndex("fr", fixture);
  assert.equal(index.length, 1);
  assert.equal(index[0].url, "/fr/aide/premiers-pas/exemple");
  assert.match(index[0].text, /Texte de recherche/);
  assert.equal(isIndexablePath("/fr/aide/premiers-pas/exemple"), false);
  assert.deepEqual(pageMetadata({ path: "/fr/aide/premiers-pas/exemple", title: "t", description: "d" }).robots, { index: false, follow: true });
});

test("sitemap lists Help categories and articles and no /guides URLs (they are 301s)", () => {
  const urls = withEnv(() => buildSitemapEntries()).map((e) => new URL(e.url).pathname);
  for (const c of categoriesFor("en")) assert.ok(urls.includes(categoryPath("en", c)), c.id);
  for (const a of HELP_ARTICLES) assert.ok(urls.includes(articlePath("en", a)!), a.id);
  assert.ok(!urls.some((u) => u === "/guides" || u.startsWith("/guides/")));
  assert.equal(new Set(urls).size, urls.length);
});

test("legacy /guides/* URLs 301 to their Help article: complete, 301, matches the equivalence map", () => {
  assert.equal(LEGACY_GUIDE_REDIRECTS.length, GUIDES.length + 1);
  for (const guide of GUIDES) {
    const r = LEGACY_GUIDE_REDIRECTS.find((x) => x.source === `/guides/${guide.slug}`);
    assert.ok(r, guide.slug);
    assert.equal(r.destination, helpPathForGuide(guide.slug));
  }
  assert.deepEqual(LEGACY_GUIDE_REDIRECTS.find((x) => x.source === "/guides"), { source: "/guides", destination: "/help" });
  const next = fs.readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
  assert.match(next, /LEGACY_GUIDE_REDIRECTS\.map\(\(r\) => \(\{ \.\.\.r, statusCode: 301 \}\)\)/);
  // no redirect chain or loop: destinations are never sources
  const sources = new Set(LEGACY_GUIDE_REDIRECTS.map((r) => r.source));
  for (const r of LEGACY_GUIDE_REDIRECTS) assert.ok(!sources.has(r.destination), `${r.source} chains`);
});

test("old guide pages are gone and nothing in src links to /guides/ any more", () => {
  const root = process.cwd();
  assert.ok(!fs.existsSync(path.join(root, "src/app/(site)/guides")));
  const hub = fs.readFileSync(path.join(root, "src/app/(site)/help/page.tsx"), "utf8");
  assert.match(hub, /HelpCategoryGrid/);
  assert.match(hub, /HelpSearch/);
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(f.name) && !/legacy-(map|redirects)\.ts$|routes\.ts$|sitemap-entries\.ts$|metadata\.ts$|types\.ts$/.test(f.name) && /["'`]\/guides[/"'`]/.test(fs.readFileSync(full, "utf8"))) offenders.push(full);
    }
  };
  walk(path.join(root, "src"));
  assert.deepEqual(offenders, []);
});

test("help search: accents, AND terms, ranking, short queries and empty results", () => {
  const index = buildSearchIndex("en");
  const hits = searchHelp(index, "online booking");
  assert.ok(hits.length > 0);
  assert.equal(hits[0].entry.id, "configure-online-booking");
  assert.deepEqual(searchHelp(index, "x"), [], "too short");
  assert.deepEqual(searchHelp(index, "zzzqqq nonsense"), [], "no results");
  assert.deepEqual(searchHelp(index, "booking zzzqqq"), [], "all terms must match");
  assert.equal(normalizeText("Réservation  à l'atelier!"), "reservation a l atelier");
  const fr = [{ id: "a", locale: "fr" as const, url: "/fr/aide/x/y", title: "Réservation en ligne", summary: "Résumé", category: "Rendez-vous", text: "page de réservation" }];
  assert.equal(searchHelp(fr, "reservation").length, 1, "accent-insensitive");
  assert.equal(searchHelp(fr, "RÉSERVATION").length, 1);
});
