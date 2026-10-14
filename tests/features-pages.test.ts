import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { PLAN_LIMITS } from "../src/config/entitlements";
import { FEATURE_PAGES, featurePath, relatedHref } from "../src/lib/feature-pages";
import { isIndexablePath, PUBLIC_ROUTES } from "../src/lib/seo/routes";
import { buildSitemapEntries } from "../src/lib/seo/sitemap-entries";
import { alternatesFor } from "../src/lib/seo/site";
import { helpPathForGuide } from "../src/lib/help";

const root = process.cwd();

test("four feature pages, complete in EN and FR, registered in the route table with their files", () => {
  assert.deepEqual(FEATURE_PAGES.map((p) => p.id).sort(), ["booking", "communications", "inspections", "quotes"]);
  for (const page of FEATURE_PAGES) {
    for (const locale of ["en", "fr"] as const) {
      const meta = page.meta[locale];
      assert.ok(meta.title.length >= 8 && meta.title.length <= 60, `${page.id} ${locale} title length`);
      assert.ok(meta.description.length >= 50 && meta.description.length <= 160, `${page.id} ${locale} description length ${meta.description.length}`);
      assert.ok(page.hero[locale].h1 && page.hero[locale].intro);
      assert.equal(page.benefits[locale].length, 4);
      assert.equal(page.steps[locale].length, 4);
      assert.ok(page.plans[locale].length > 40);
    }
    const route = PUBLIC_ROUTES.find((r) => r.en === featurePath("en", page));
    assert.ok(route, `${page.id}: not in route table`);
    assert.equal(route.fr, featurePath("fr", page));
    assert.ok(fs.existsSync(path.join(root, `src/app/(site)${featurePath("en", page)}/page.tsx`)), `${page.id} EN page file`);
    assert.ok(fs.existsSync(path.join(root, `src/app/(fr)${featurePath("fr", page)}/page.tsx`)), `${page.id} FR page file`);
  }
});

test("EN feature pages are in the sitemap; FR drafts are noindex, not in the sitemap and have no hreflang", () => {
  const urls = buildSitemapEntries().map((e) => new URL(e.url).pathname);
  for (const page of FEATURE_PAGES) {
    assert.ok(urls.includes(featurePath("en", page)), `${page.id} in sitemap`);
    assert.ok(!urls.includes(featurePath("fr", page)), `${page.id} FR must not be in the sitemap`);
    assert.equal(isIndexablePath(featurePath("fr", page)), false, `${page.id} FR must stay noindex`);
    assert.equal(alternatesFor(featurePath("en", page)), undefined);
    assert.equal(alternatesFor(featurePath("fr", page)), undefined);
  }
});

test("claims stay grounded: SMS allowance derived from plan limits, no invented numbers, prices or testimonials", () => {
  const comms = FEATURE_PAGES.find((p) => p.id === "communications")!;
  const text = JSON.stringify(comms.benefits);
  for (const plan of ["CORE", "PRO", "COMPLETE"] as const) {
    assert.ok(text.includes((PLAN_LIMITS[plan].smsSegmentsPerMonth).toLocaleString("en-CA")), `EN ${plan} allowance`);
    assert.ok(text.includes((PLAN_LIMITS[plan].smsSegmentsPerMonth).toLocaleString("fr-CA")), `FR ${plan} allowance`);
  }
  const all = JSON.stringify(FEATURE_PAGES);
  assert.ok(!/\$\s?\d|\d\s?\$|%|testimonial|témoignage|guarantee|garantie|#1|best|meilleur/i.test(all.replace(/\\u00a0/g, " ")), "no prices, percentages, testimonials or superlatives");
  assert.ok(!/soumission|bon de travail/i.test(all), "FR terminology guard (Devis / Ordre de travail)");
});

test("related links resolve: Help articles exist, feature links map to the page in the right language", () => {
  const helpTargets = new Set(["configure-online-booking", "digital-vehicle-inspections", "estimate-to-invoice", "branded-communications", "maintenance-reminders"].map((g) => helpPathForGuide(g)));
  for (const page of FEATURE_PAGES) {
    for (const r of page.related) {
      if (r.href.startsWith("/help/")) assert.ok(helpTargets.has(r.href), r.href);
      else assert.ok(r.href === "/pricing" || r.href.startsWith("/features/"), r.href);
      if (r.href.startsWith("/features/")) {
        assert.ok(FEATURE_PAGES.some((p) => featurePath("en", p) === r.href), `${r.href} is a real feature page`);
        assert.match(relatedHref("fr", r.href), /^\/fr\/fonctionnalites\//);
      }
    }
  }
});

const BUILT = path.join(root, ".next/server/app");
const built = fs.existsSync(path.join(BUILT, "features/online-booking.html"));
test("rendered feature pages: one h1, own canonical, CTA to /demo and /get-started; EN has BreadcrumbList, FR is noindex", { skip: !built && "run `next build` first" }, () => {
  for (const page of FEATURE_PAGES) {
    for (const locale of ["en", "fr"] as const) {
      const rel = locale === "en" ? `features/${page.slug.en}.html` : `fr/fonctionnalites/${page.slug.fr}.html`;
      const html = fs.readFileSync(path.join(BUILT, rel), "utf8");
      assert.equal([...html.matchAll(/<h1[\s>]/g)].length, 1, `${rel} one h1`);
      assert.match(html, new RegExp(`<link rel="canonical" href="https?://[^"]+${featurePath(locale, page)}"`), rel);
      assert.match(html, /href="\/demo"/, `${rel} demo CTA`);
      assert.match(html, /href="\/get-started"/, `${rel} signup CTA`);
      assert.match(html, new RegExp(`<html lang="${locale === "en" ? "en-CA" : "fr-CA"}"`));
      if (locale === "en") {
        assert.ok(!/<meta name="robots" content="[^"]*noindex/.test(html), `${rel} indexable`);
        assert.match(html, /"@type":"BreadcrumbList"/, `${rel} breadcrumb`);
      } else {
        assert.match(html, /<meta name="robots" content="noindex, follow"/, `${rel} noindex`);
        assert.ok(!/<link rel="alternate" hrefLang=/i.test(html));
      }
    }
  }
});
