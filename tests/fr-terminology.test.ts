import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * French (Canada / Québec) terminology guard.
 *
 * Product decisions:
 *  - FR "quote" is "devis" (masculine, invariable plural). "soumission" is NOT used for the quote document.
 *  - FR "work order" is "ordre de travail". "bon de travail" is not used.
 *  - Agreement must follow the masculine gender (le devis, un devis, ce devis, devis accepté...).
 *
 * French strings live in dictionaries AND inline in pages/emails, and EN/ES strings never contain these
 * French words, so the scan reads the source text of every file under src/.
 */

const ROOT = path.resolve(process.cwd());
const SRC = path.join(ROOT, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|md|mdx|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

const FILES = walk(SRC).map((abs) => ({ rel: path.relative(ROOT, abs), text: fs.readFileSync(abs, "utf8") }));

/**
 * Explicit allowlist for "soumission" (any case, accents or not). Each entry needs a reason.
 * Key: repo-relative path. Value: { count: max occurrences, reason }.
 * Currently empty: every former occurrence was either the quote document (now "devis") or a form
 * submission (reworded as "envoi", e.g. sales-field IDEMPOTENCY_CONFLICT).
 */
const SOUMISSION_ALLOWLIST: Record<string, { count: number; reason: string }> = {};

function lines(text: string) {
  return text.split("\n").map((l, i) => ({ l, n: i + 1 }));
}

function findAll(re: RegExp, filter?: (rel: string) => boolean) {
  const hits: string[] = [];
  for (const f of FILES) {
    if (filter && !filter(f.rel)) continue;
    for (const { l, n } of lines(f.text)) {
      const m = l.match(re);
      if (m) hits.push(`${f.rel}:${n}: ${m[0]}`);
    }
  }
  return hits;
}

test("French user-facing text does not say 'soumission' (outside the commented allowlist)", () => {
  const re = /soumission/i;
  const hits: string[] = [];
  for (const f of FILES) {
    const count = lines(f.text).filter(({ l }) => re.test(l)).length;
    const allowed = SOUMISSION_ALLOWLIST[f.rel]?.count ?? 0;
    if (count > allowed) hits.push(`${f.rel}: ${count} occurrence(s), ${allowed} allowed`);
  }
  assert.deepEqual(hits, [], `Use "devis" for the quote document, "envoi" for a submission:\n${hits.join("\n")}`);
  for (const [file, entry] of Object.entries(SOUMISSION_ALLOWLIST)) {
    assert.ok(entry.reason.length > 10, `Allowlist entry for ${file} needs a reason`);
  }
});

test("French text uses 'ordre de travail', never 'bon de travail'", () => {
  const hits = findAll(/bons?\s+de\s+travail/i);
  assert.deepEqual(hits, [], `Replace with "ordre(s) de travail":\n${hits.join("\n")}`);
});

test("French 'devis' / 'ordre de travail' agree in the masculine", () => {
  const patterns: RegExp[] = [
    /\b(la|une|cette|ma|sa|ta|de la|à la)\s+devis\b/i,
    /\bdevis\s+(accept|refus|envoy|expir|convert|annul|approuv|cré|supprim|modifi)(ée|ées)\b/i,
    /\bnouvelle\s+devis\b/i,
    /\btoutes\s+les\s+devis\b/i,
    /\baucune\s+devis\b/i,
    /\b(première|seule|prochaine|dernière)\s+devis\b/i,
    /\bdevis\s+(claires?|détaillées?|jointes?)\b/i,
    /\b(la|une|cette|ma|sa|ta|de la|à la|nouvelle)\s+ordres?\s+de\s+travail\b/i,
    /\b(le|ce|de|du)\s+ordre\b/i, // elision: l'ordre, cet ordre, de l'ordre
  ];
  const hits: string[] = [];
  for (const re of patterns) hits.push(...findAll(re).map((h) => `${re}: ${h}`));
  assert.deepEqual(hits, [], hits.join("\n"));
});

test("Spot checks of the final FR wording", async () => {
  const { QUOTES_DICT } = await import("../src/lib/admin-locale/quotes");
  const fr = QUOTES_DICT.fr;
  assert.equal(fr.list.title, "Devis");
  assert.equal(fr.list.newQuote, "Nouveau devis");
  assert.equal(fr.status.ACCEPTED, "Accepté");
  assert.equal(fr.status.CONVERTED, "Converti");
  assert.equal(fr.actions.accepted, "Devis accepté");
  assert.equal(fr.sendDialog.sendTitle, "Envoyer le devis");
  // English / Spanish untouched
  assert.equal(QUOTES_DICT.en.list.title, "Quotes");
  assert.equal(QUOTES_DICT.es.list.title, "Cotizaciones");
});

// ---- (iv) French dictionaries keep the same keys as English ----

function shape(v: unknown): unknown {
  if (v === null || v === undefined) return typeof v;
  if (typeof v === "function") return "fn";
  if (Array.isArray(v)) return v.map(shape);
  if (typeof v === "object") {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, shape((v as Record<string, unknown>)[k])]));
  }
  return typeof v;
}

function keyPaths(v: unknown, prefix = ""): string[] {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.keys(v as object).flatMap((k) => keyPaths((v as Record<string, unknown>)[k], `${prefix}${k}.`));
  }
  return [prefix.slice(0, -1)];
}

test("admin-locale FR dictionaries have the same keys as EN", async () => {
  const dir = path.join(SRC, "lib", "admin-locale");
  const compared: string[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const mod = (await import(path.join(dir, file))) as Record<string, unknown>;
    for (const [name, value] of Object.entries(mod)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      if (!("en" in v) || !("fr" in v)) continue;
      compared.push(`${file}:${name}`);
      const en = keyPaths(v.en).sort();
      const fr = keyPaths(v.fr).sort();
      assert.deepEqual(fr, en, `${file}:${name} FR keys differ from EN`);
      assert.deepEqual(shape(v.fr), shape(v.en), `${file}:${name} FR shape differs from EN`);
    }
  }
  assert.ok(compared.length > 10, `expected to compare many dictionaries, got ${compared.length}`);
});
