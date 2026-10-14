/**
 * Vague 1 des pages commerciales françaises (/fr/produit, /fr/fonctionnalites, /fr/tarifs, /fr/integrations).
 * Les pages existent et se rendent, mais restent noindex, hors sitemap et sans hreflang tant que la publication
 * n'est pas approuvée explicitement: pour les publier, il faut modifier la liste APPROVED ci-dessous (ce test est le verrou).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { PUBLIC_ROUTES, isIndexablePath } from "../src/lib/seo/routes";
import { pageMetadata } from "../src/lib/seo/metadata";
import { buildSitemapEntries } from "../src/lib/seo/sitemap-entries";
import { alternatesFor } from "../src/lib/seo/site";
import { PRICING_PAGE_COPY } from "../src/lib/marketing-plans";
import { PLAN_PRICING_CAD } from "../src/config/entitlements";

const WAVE1 = ["/fr/produit", "/fr/fonctionnalites", "/fr/tarifs", "/fr/integrations", "/fr/demo", "/fr/commencer", "/fr/contact"] as const;
/** Pages françaises dont la publication (index + sitemap + hreflang) a été approuvée par le propriétaire. */
const APPROVED: readonly string[] = [];

const root = process.cwd();
const fileOf = (p: string) => path.join(root, "src/app/(fr)", `${p}/page.tsx`);

test("wave 1 FR pages exist, declare their own path via pageMetadata and share the route table entries", () => {
  for (const p of WAVE1) {
    assert.ok(fs.existsSync(fileOf(p)), `${p}: missing page`);
    assert.ok(fs.readFileSync(fileOf(p), "utf8").includes(`path: "${p}"`), `${p}: wrong metadata path`);
    assert.ok(PUBLIC_ROUTES.some((r) => r.fr === p), `${p}: not in the route table`);
  }
});

test("wave 1 FR pages stay noindex, out of the sitemap and without hreflang until approved", () => {
  const urls = buildSitemapEntries().map((e) => new URL(e.url).pathname);
  for (const p of WAVE1) {
    if (APPROVED.includes(p)) continue;
    assert.equal(isIndexablePath(p), false, `${p} must not be indexable`);
    assert.deepEqual(pageMetadata({ path: p, title: "t", description: "d" }).robots, { index: false, follow: true }, p);
    assert.ok(!urls.includes(p), `${p} must not be in the sitemap`);
    assert.equal(alternatesFor(p), undefined, `${p} must not emit hreflang`);
  }
  const live = PUBLIC_ROUTES.filter((r) => r.frStatus === "live" && r.frIndexable !== false).map((r) => r.fr);
  assert.deepEqual(live.sort(), [...APPROVED].sort(), "only approved FR routes may be live and indexable");
});

test("FR pricing metadata is derived from the plan constants", () => {
  const d = PRICING_PAGE_COPY.fr.meta.description;
  for (const plan of ["CORE", "PRO", "COMPLETE"] as const) assert.ok(d.includes(`${PLAN_PRICING_CAD[plan].monthly} $`), `${plan} price in FR description`);
  const en = PRICING_PAGE_COPY.en.meta.description;
  for (const plan of ["CORE", "PRO", "COMPLETE"] as const) assert.ok(en.includes(`$${PLAN_PRICING_CAD[plan].monthly}`), `${plan} price in EN description`);
});

const BUILT = path.join(root, ".next/server/app/fr");
const built = fs.existsSync(path.join(BUILT, "produit.html"));
const ENGLISH = /\b(the|your|and|with|from|start|free trial|learn more|get started)\b/gi;

test("rendered FR pages: lang, noindex+follow, own canonical, single h1, no hreflang, no English leftovers", { skip: !built && "run `next build` first" }, () => {
  for (const p of WAVE1) {
    const html = fs.readFileSync(path.join(BUILT, `${p.replace("/fr/", "")}.html`), "utf8");
    assert.match(html, /<html lang="fr-CA"/, p);
    assert.match(html, /<meta name="robots" content="noindex, follow"/, p);
    assert.match(html, new RegExp(`<link rel="canonical" href="https?://[^"]+${p}"`), p);
    assert.equal([...html.matchAll(/<h1[\s>]/g)].length, 1, `${p}: one h1`);
    assert.ok(!/<link rel="alternate" hrefLang=/i.test(html), `${p}: no hreflang while noindex`);
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");
    const leftovers = (text.match(ENGLISH) ?? []).length;
    assert.ok(leftovers <= 2, `${p}: ${leftovers} English function words in visible text`);
  }
});
