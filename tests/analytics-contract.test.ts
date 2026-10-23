// Analytics v2 vocabulary and classification (pure functions; no database, no network).
import assert from "node:assert/strict";
import test from "node:test";
import { CTA_IDS, classifyChannel, classifyPageType, isCtaId, parseHandoff, strictCampaignValue } from "../src/lib/analytics/contract";

test("CTA allowlist is exactly the eight contract ids", () => {
  assert.equal(CTA_IDS.length, 8);
  for (const id of CTA_IDS) assert.ok(isCtaId(id));
  for (const bad of ["", "demo", "DEMO_BOOK", "plan_select_enterprise", "x".repeat(40), null, undefined, 3, {}]) assert.ok(!isCtaId(bad), String(bad));
});

test("channel: campaign wins over referrer, email medium refines, search/social/referral/direct otherwise", () => {
  assert.equal(classifyChannel({ utmSource: "newsletter", utmMedium: "email", referrerHost: "google.com" }), "email");
  assert.equal(classifyChannel({ utmSource: "google", utmMedium: "cpc", referrerHost: "google.com" }), "campaign");
  assert.equal(classifyChannel({ utmCampaign: "spring" }), "campaign");
  assert.equal(classifyChannel({ referrerHost: "www.google.ca" }), "organic_search");
  assert.equal(classifyChannel({ referrerHost: "duckduckgo.com" }), "organic_search");
  assert.equal(classifyChannel({ referrerHost: "search.brave.com" }), "organic_search");
  assert.equal(classifyChannel({ referrerHost: "l.facebook.com" }), "social");
  assert.equal(classifyChannel({ referrerHost: "lnkd.in" }), "social");
  assert.equal(classifyChannel({ referrerHost: "t.co" }), "social");
  assert.equal(classifyChannel({ referrerHost: "some-blog.example" }), "referral");
  assert.equal(classifyChannel({}), "direct");
  assert.equal(classifyChannel({ referrerHost: "www.garage-os.ca", ownHost: "www.garage-os.ca" }), "direct", "internal navigation is never a channel");
});

test("page type from normalised public paths, EN and FR", () => {
  const cases: [string, string][] = [
    ["/", "home"], ["/fr", "home"], ["/pricing", "commercial"], ["/fr/tarifs", "commercial"], ["/features/online-booking", "commercial"],
    ["/fr/fonctionnalites/reservation-en-ligne", "commercial"], ["/get-started", "commercial"], ["/help", "help"], ["/help/getting-started/set-up-your-shop", "help"],
    ["/fr/aide", "help"], ["/resources", "help"], ["/blog/useful-vehicle-history", "blog"], ["/privacy", "legal"], ["/fr/conditions", "legal"],
    ["/watch/en", "watch"], ["/changelog", "other"], ["/book/some-shop", "other"], ["/pricing?x=1", "commercial"],
  ];
  for (const [path, type] of cases) assert.equal(classifyPageType(path), type, path);
});

test("utm values: legitimate pass (lower-cased), personal-looking and token-shaped are dropped", () => {
  for (const ok of ["google", "Newsletter", "fall-2026_promo", "spring sale", "fr-ca", "cpc", "a1", "promo-été-2026", "Québec 2026", "pneus d'hiver", "Pneus d\u2019hiver", "email-blast-2026-10-22", "2026-10-13"]) assert.equal(strictCampaignValue(ok), ok.toLowerCase(), ok);
  const bad = ["user@example.com", "https://evil.example/x", "514-555-0199", "5145550199", "a%40b.com", "a".repeat(30), "token_" + "A1b2C3d4".repeat(4), "-leading", "has/slash", "x".repeat(41), "", "   ", "9876543210", "ab12cd34ef56ab12cd34ef56", "promo\u202eevil", "brand | search", "q4/launch", "{campaignid}"];
  for (const v of bad) assert.equal(strictCampaignValue(v), "", v);
  for (const v of [null, undefined, 5, {}, []]) assert.equal(strictCampaignValue(v), "");
});

test("hand-off parameters: only from=<pageType>:<slug> and lang en|fr survive", () => {
  assert.deepEqual(parseHandoff({ from: "commercial:pricing", lang: "fr" }), { pageType: "commercial", slug: "pricing", lang: "fr" });
  assert.deepEqual(parseHandoff({ from: "help:set-up-your-shop", lang: "en" }), { pageType: "help", slug: "set-up-your-shop", lang: "en" });
  for (const from of ["commercial:", "pricing", "evil:pricing", "commercial:UPPER_case", "commercial:a b", "commercial:" + "a".repeat(41), "https://x.example", ""]) {
    assert.equal(parseHandoff({ from, lang: "xx" }).pageType, "", from);
    assert.equal(parseHandoff({ from, lang: "xx" }).lang, "");
  }
  assert.equal(parseHandoff({ from: null, lang: null }).lang, "");
});
