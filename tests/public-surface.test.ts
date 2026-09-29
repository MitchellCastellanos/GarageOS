import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  CAPABILITY_MIN_PLAN,
  PLANS,
  PLAN_LIMITS,
  PLAN_PRICING_CAD,
  minPlanFor,
  planAtLeast,
  planIncludes,
  type CapabilityKey,
} from "../src/config/entitlements";
import {
  COMPARISON,
  MOST_POPULAR_PLAN,
  PLAN_CARDS,
  PRICING_PAGE_COPY,
  TRIAL_COPY,
  TRIAL_DAYS,
  comparisonCell,
  type Localized,
} from "../src/lib/marketing-plans";
import { MARKETING_PRICING } from "../src/lib/marketing-pricing";
import { MARKETING_DICTIONARIES } from "../src/lib/marketing-locale";
import {
  FEATURE_GROUPS,
  INTEGRATIONS_AVAILABLE,
  INTEGRATIONS_NOT_AVAILABLE,
  PLAN_BADGE,
  PRODUCT_CUSTOMER,
  PRODUCT_MANAGEMENT,
  PRODUCT_WORKFLOW,
  itemMinPlan,
} from "../src/lib/marketing-pages";
import { DEMO_STEPS, GET_STARTED_STEPS, QUICK_START_STEPS } from "../src/lib/marketing-flow";
import { GUIDES } from "../src/lib/marketing-resources";
import { IMPORT_LIMITS } from "../src/domain/import";

const ROOT = path.resolve(import.meta.dirname, "..");

// ── precios: fuente única ───────────────────────────────────

test("public pricing is the contract: Core 199/1990, Pro 299/2990, Complete 449/4490 CAD (Pro most popular)", () => {
  assert.deepEqual(PLAN_PRICING_CAD, {
    CORE: { monthly: 199, yearly: 1990 },
    PRO: { monthly: 299, yearly: 2990 },
    COMPLETE: { monthly: 449, yearly: 4490 },
  });
  assert.equal(MOST_POPULAR_PLAN, "PRO");
  for (const locale of ["en", "fr"] as const) {
    const plans = MARKETING_PRICING[locale].plans;
    assert.deepEqual(plans.map((p) => p.name), ["Core", "Pro", "Complete"]);
    assert.deepEqual(plans.map((p) => [p.monthlyPrice, p.yearlyPrice]), [[199, 1990], [299, 2990], [449, 4490]]);
    assert.ok(plans.every((p) => p.cta.includes(String(TRIAL_DAYS))), "every CTA leads with the 14-day trial");
  }
  // Anual = 10 meses por 12.
  for (const plan of PLANS) assert.equal(PLAN_PRICING_CAD[plan].yearly, PLAN_PRICING_CAD[plan].monthly * 10);
  assert.equal(TRIAL_DAYS, 14);
});

test("trial messaging: $0 today, card collected, automatic billing after the trial (EN and FR)", () => {
  assert.match(TRIAL_COPY.en.steps.join(" "), /\$0 today/);
  assert.match(TRIAL_COPY.en.steps.join(" "), /automatically/i);
  assert.match(TRIAL_COPY.en.steps.join(" "), /payment method/i);
  assert.match(TRIAL_COPY.fr.steps.join(" "), /0 \$ aujourd'hui/);
  assert.match(TRIAL_COPY.fr.steps.join(" "), /automatiquement/i);
});

test("Multi-Shop copy does not state the unconfirmed $199 additional-location price", () => {
  for (const locale of ["en", "fr"] as const) {
    const text = JSON.stringify([PRICING_PAGE_COPY[locale], MARKETING_PRICING[locale], PLAN_CARDS.map((c) => c.features[locale])]);
    assert.doesNotMatch(text, /\b199\b.{0,40}(location|emplacement|établissement)|(location|emplacement).{0,60}\b199\b/i);
  }
});

// ── comparación = entitlements ──────────────────────────────

test("every comparison row agrees with the entitlement map and plan limits", () => {
  for (const group of COMPARISON) {
    for (const row of group.rows) {
      const kinds = [row.capability, row.tier, row.values].filter(Boolean).length;
      assert.equal(kinds, 1, `${row.id}: exactly one source of truth`);
      if (row.capability) {
        for (const plan of PLANS) {
          assert.equal(comparisonCell(row, plan), planIncludes(plan, row.capability), `${row.id}/${plan}`);
        }
        assert.ok(row.capability in CAPABILITY_MIN_PLAN);
      }
      if (row.tier) {
        const min = minPlanFor(row.tier.gate);
        for (const plan of PLANS) {
          const expected: Localized = planAtLeast(plan, min) ? row.tier.advanced : row.tier.basic;
          assert.equal(comparisonCell(row, plan), expected, `${row.id}/${plan}`);
        }
        assert.notDeepEqual(row.tier.basic, row.tier.advanced);
      }
    }
  }
  const users = COMPARISON.flatMap((g) => g.rows).find((r) => r.id === "users")!;
  for (const plan of PLANS) {
    const cell = comparisonCell(users, plan) as Localized;
    assert.equal(cell.en, PLAN_LIMITS[plan].users == null ? "Unlimited" : String(PLAN_LIMITS[plan].users));
  }
});

test("import limits shown in the comparison match the real limits", () => {
  const row = COMPARISON.flatMap((g) => g.rows).find((r) => r.id === "import")!;
  assert.ok(row.tier!.basic.en.includes(String(IMPORT_LIMITS.basicMaxRows)));
  assert.ok(row.tier!.advanced.en.replace(/[,\s ]/g, "").includes(String(IMPORT_LIMITS.fullMaxRows)));
});

test("plans are supersets: nothing in a cheaper plan is missing from a more expensive one", () => {
  for (const row of COMPARISON.flatMap((g) => g.rows).filter((r) => r.capability || r.tier)) {
    const included = PLANS.map((p) => comparisonCell(row, p) !== false);
    assert.deepEqual(included, [...included].sort(), row.id);
  }
});

test("every advertised capability exists in the entitlement map; every gated capability is advertised", () => {
  const advertised = new Set<CapabilityKey>();
  for (const row of COMPARISON.flatMap((g) => g.rows)) {
    if (row.capability) advertised.add(row.capability);
    if (row.tier) advertised.add(row.tier.gate);
  }
  const gates = [...FEATURE_GROUPS.flatMap((g) => g.items), ...INTEGRATIONS_AVAILABLE].flatMap((i) => (i.gate ? [i.gate] : []));
  for (const gate of gates) assert.ok(gate in CAPABILITY_MIN_PLAN, gate);
  // Capacidades que no tienen fila propia porque son parte de otra fila.
  const covered = new Set<CapabilityKey>([...advertised, "dvi.templates", "dvi.customerReport", "branding.customSender"]);
  for (const key of Object.keys(CAPABILITY_MIN_PLAN) as CapabilityKey[]) {
    assert.ok(covered.has(key), `${key} is enforced in code but isn't shown in the plan comparison`);
  }
});

test("plan badges on Features come from entitlements (Pro/Complete only, Core has none)", () => {
  for (const item of FEATURE_GROUPS.flatMap((g) => g.items)) {
    const min = itemMinPlan(item);
    if (item.gate) assert.equal(min, CAPABILITY_MIN_PLAN[item.gate]);
    else assert.equal(min, "CORE");
    if (min !== "CORE") assert.ok(PLAN_BADGE[min].en && PLAN_BADGE[min].fr);
  }
  // Ejemplos con sentido comercial.
  const byTitle = (t: string) => FEATURE_GROUPS.flatMap((g) => g.items).find((i) => i.title.en === t)!;
  assert.equal(itemMinPlan(byTitle("Customer portal")), "CORE");
  assert.equal(itemMinPlan(byTitle("Digital inspections (DVI)")), "CORE");
  assert.equal(itemMinPlan(byTitle("Advanced DVI")), "PRO");
  assert.equal(itemMinPlan(byTitle("Multi-Shop")), "COMPLETE");
  assert.equal(itemMinPlan(byTitle("Consolidated reporting")), "COMPLETE");
});

// ── EN/FR coherentes ────────────────────────────────────────

function collectLocalized(value: unknown, where: string, out: { where: string; v: Localized }[] = []) {
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.en === "string" && typeof o.fr === "string" && Object.keys(o).length === 2) out.push({ where, v: o as Localized });
    else for (const [k, x] of Object.entries(o)) collectLocalized(x, `${where}.${k}`, out);
  }
  return out;
}

test("every public string has both languages; French is not a copy of the English", () => {
  const pieces = collectLocalized(
    { COMPARISON, FEATURE_GROUPS, PRODUCT_WORKFLOW, PRODUCT_CUSTOMER, PRODUCT_MANAGEMENT, INTEGRATIONS_AVAILABLE, INTEGRATIONS_NOT_AVAILABLE, DEMO_STEPS, GET_STARTED_STEPS, QUICK_START_STEPS, PLAN_BADGE },
    "pages"
  );
  assert.ok(pieces.length > 150, `found ${pieces.length} localized strings`);
  const sameOk = /^(\d+|Pro|Complete|Core|QuickBooks Online|1|CSV.*)$/;
  for (const { where, v } of pieces) {
    assert.ok(v.en.trim() && v.fr.trim(), `${where} missing a language`);
    if (v.en.length > 22 && !sameOk.test(v.en)) assert.notEqual(v.fr, v.en, `${where} is untranslated`);
  }
});

test("EN and FR plan cards and page copy have the same structure", () => {
  for (const card of PLAN_CARDS) assert.equal(card.features.en.length, card.features.fr.length, card.plan);
  const shape = (v: unknown): unknown =>
    typeof v === "function" ? "fn" : Array.isArray(v) ? v.map(shape) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v;
  assert.deepEqual(shape(MARKETING_DICTIONARIES.fr), shape(MARKETING_DICTIONARIES.en), "marketing dictionaries stay structurally identical");
  assert.deepEqual(shape(MARKETING_PRICING.fr), shape(MARKETING_PRICING.en));
  assert.deepEqual(shape(PRICING_PAGE_COPY.fr), shape(PRICING_PAGE_COPY.en));
  assert.deepEqual(shape(TRIAL_COPY.fr), shape(TRIAL_COPY.en));
});

// ── sin claims obsoletos ────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|md)$/.test(e.name)) out.push(p);
  }
  return out;
}

const PUBLIC_FILES = [
  "src/app/page.tsx",
  ...["about", "blog", "changelog", "contact", "demo", "features", "get-started", "guides", "help", "integrations", "pricing", "privacy", "product", "quick-start", "terms"].map((d) => `src/app/${d}`),
  "src/components/marketing",
  ...fs.readdirSync(path.join(ROOT, "src/lib")).filter((f) => /^marketing-.*\.ts$/.test(f)).map((f) => `src/lib/${f}`),
].flatMap((rel) => {
  const abs = path.join(ROOT, rel);
  return fs.statSync(abs).isDirectory() ? walk(abs) : [abs];
});

test("public copy has no stale pricing, Founding offers, VIN, Kanban/Work Board, POs, AI or fake claims", () => {
  const banned: [RegExp, string][] = [
    [/founding/i, "Founding Shops/Partner"],
    [/\$(39|79|129|149|249|399)(?![.,\d])/, "old price"],
    [/\b(39|79|129|149|249|399)\s?\$(?!\s?\/)/, "old French price"],
    [/\bVIN\b/, "VIN"],
    [/kanban|work board/i, "Work Board"],
    [/purchase order|suppliers?\b/i, "Purchase orders / suppliers"],
    [/\bAI\b|artificial intelligence|machine learning/i, "AI claim"],
    [/hundreds of (garages|shops)|thousands of (garages|shops)/i, "unsupported traction"],
    [/google drive/i, "Google Drive (not implemented)"],
    [/\bAPI access\b|public API is|api\.garageos/i, "public API"],
    [/\bStarter\b/, "old Starter plan"],
    [/testimonial/i, "testimonial"],
    [/\bsoc ?2\b|hipaa|iso 27001/i, "certification claim"],
  ];
  const offenders: string[] = [];
  for (const file of PUBLIC_FILES) {
    const text = fs.readFileSync(file, "utf8");
    for (const [re, label] of banned) {
      const m = text.match(re);
      if (m) offenders.push(`${path.relative(ROOT, file)}: ${label} → "${m[0]}"`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("the demo and pricing link only to guides that exist", () => {
  const slugs = new Set(GUIDES.map((g) => g.slug));
  for (const step of DEMO_STEPS) {
    const m = step.href.match(/^\/guides\/(.+)$/);
    if (m) assert.ok(slugs.has(m[1]), `missing guide ${m[1]}`);
  }
});

test("Complete's public promise matches what exists: multi-location, consolidated reporting; no API", () => {
  const complete = PLAN_CARDS.find((c) => c.plan === "COMPLETE")!;
  const text = complete.features.en.join(" ");
  assert.match(text, /Multiple locations/i);
  assert.match(text, /Consolidated reporting/i);
  assert.doesNotMatch(text, /API/);
  assert.equal(minPlanFor("organization.multiLocation"), "COMPLETE");
  assert.equal(minPlanFor("reports.multiLocation"), "COMPLETE");
  const core = PLAN_CARDS.find((c) => c.plan === "CORE")!.features.en.join(" ");
  assert.match(core, /Customer portal/i, "the portal is Core+");
});

test("QuickBooks is described by what it does, without certification or 'official' claims", () => {
  const qb = INTEGRATIONS_AVAILABLE.find((i) => i.title.en === "QuickBooks Online")!;
  assert.doesNotMatch(qb.description.en + qb.description.fr, /certified|official|approved by Intuit|certifi|officiel/i);
  assert.equal(qb.gate, "quickbooks.sync");
});
