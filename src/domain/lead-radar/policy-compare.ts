// National Lead Radar — policy comparison report (pure). Evaluates the SAME candidate rows under two rule sets and explains every difference. It reads facts and
// returns numbers; it never touches a database, so the same code powers the Super Admin screen and the standalone read-only production report.
import { evaluateQualification, type QualificationFacts, type QualificationLane, type QualificationResult } from "@/domain/lead-radar/qualification";
import { canonicalRules, type PolicyRules } from "@/domain/lead-radar/policy-rules";
import { independentSources } from "@/domain/lead-radar/business-type";

export interface CompareRow extends QualificationFacts {
  city: string | null;
  /** Source confidence 0–1 as staged. Used ONLY for diagnostics, never for a decision. */
  sourceConfidence: number | null;
}

type LaneKey = QualificationLane | "OUT_OF_SCOPE";
type Lanes = Record<LaneKey, number>;
const lanes0 = (): Lanes => ({ AUTO_ELIGIBLE: 0, HUMAN_REVIEW: 0, BLOCKED: 0, OUT_OF_SCOPE: 0 });
const laneOf = (r: QualificationResult): LaneKey => r.lane ?? "OUT_OF_SCOPE";

export interface Example { label: string; name?: string; city: string | null; province: string | null; category: string | null; businessType: string; from: string; to: string; why: string }
export interface MovementGroup { cause: string; from: string; to: string; count: number; byBusinessType: Record<string, number>; examples: Example[] }
export interface Violation { rule: string; count: number }

export interface ComparisonReport {
  evaluated: number;
  a: { lanes: Lanes; reasons: Record<string, number> };
  b: { lanes: Lanes; reasons: Record<string, number> };
  transitions: Record<string, number>;
  movements: MovementGroup[];
  byBusinessType: Record<string, { total: number; a: Lanes; b: Lanes }>;
  byCategory: { category: string; total: number; aAuto: number; bAuto: number; bReview: number; bBlocked: number }[];
  byTerritory: Record<string, { total: number; aAuto: number; bAuto: number; bReview: number }>;
  lowConfidence: {
    flagged: number;
    byConfidence: Record<string, number>;
    byIndependentSources: Record<string, number>;
    withPhoneAndStreetAddress: number;
    corroboratedAndAutoUnderB: number;
    note: string;
  };
  invariants: { ok: boolean; checked: string[]; violations: Violation[] };
  pilot: { autoA: number; autoB: number; autoDelta: number; reviewA: number; reviewB: number; reviewReductionPct: number; blockedA: number; blockedB: number; autoBMontrealField: number; autoBRemote: number; autoBUnresolvedTerritory: number; assumptions: string[] };
  examplesIncludeNames: boolean;
}

export interface CompareOptions { examplesPerGroup?: number; includeNames?: boolean; topCategories?: number }

const bump = (m: Record<string, number>, k: string, n = 1) => { m[k] = (m[k] ?? 0) + n; };
const minus = (x: readonly string[], y: readonly string[]) => x.filter((v) => !y.includes(v));
const territoryOf = (k: string | null) => (k === "greater-montreal" ? "FIELD · Greater Montréal" : k === "national" || k === "canada" ? "REMOTE · rest of Canada" : k === "unresolved" ? "UNRESOLVED" : k ?? "none");
const confBucket = (c: number | null) => (c === null ? "unknown" : c < 0.25 ? "<0.25" : c < 0.5 ? "0.25–0.5" : c < 0.75 ? "0.5–0.75" : "≥0.75");

/** The rules that no policy option may ever bypass; checked on the B side so a future rule change that breaks them is caught in the report itself. */
function violations(rows: readonly CompareRow[], resB: readonly QualificationResult[], rb: PolicyRules): Violation[] {
  const v: Record<string, number> = {};
  rows.forEach((f, i) => {
    if (resB[i].lane !== "AUTO_ELIGIBLE") return;
    if (!f.licenseOk) bump(v, "AUTO with a disallowed licence");
    if (f.tier === "EXCLUDED") bump(v, "AUTO with an excluded record");
    if (f.matchState === "AMBIGUOUS") bump(v, "AUTO with an ambiguous CRM match");
    if (f.matchState === "BRANCH_OF_EXISTING") bump(v, "AUTO with an unresolved branch relationship");
    if (f.chainSignal === "CHAIN_SIGNAL" && rb.chainSignal === "REVIEW") bump(v, "AUTO with a chain/franchise signal under a REVIEW chain rule");
    if ((f.stickyReasons ?? []).includes("SOURCE_CHANGED")) bump(v, "AUTO with a source change after approval");
    if ((f.classReasons ?? []).some((c) => c === "POSSIBLE_DEALER_SERVICE" || c === "ALSO_DEALER")) bump(v, "AUTO with a possible dealership service department");
    if (!f.phone && !f.address && !f.postalCode) bump(v, "AUTO with no usable contact or location");
    if (f.datasets.length === 0 || f.licenses.length === 0) bump(v, "AUTO without source provenance");
    if (f.qualityFlags.includes("LOW_CONFIDENCE") && rb.reviewFlags.includes("LOW_CONFIDENCE") && !(rb.lowConfidence === "CORROBORATED" && independentSources(f.datasets) >= 2 && !!f.phone && !!f.address)) bump(v, "AUTO with low confidence and no independent corroboration");
  });
  return Object.entries(v).map(([rule, count]) => ({ rule, count }));
}

export function buildComparison(rowsIn: readonly CompareRow[], rulesA: PolicyRules, rulesB: PolicyRules, opts: CompareOptions = {}): ComparisonReport {
  const ra = canonicalRules(rulesA), rb = canonicalRules(rulesB);
  const perGroup = opts.examplesPerGroup ?? 3, includeNames = opts.includeNames === true;
  const rows = rowsIn;
  const resA = rows.map((f) => evaluateQualification(ra, f));
  const resB = rows.map((f) => evaluateQualification(rb, f));

  const rep: ComparisonReport = {
    evaluated: rows.length, a: { lanes: lanes0(), reasons: {} }, b: { lanes: lanes0(), reasons: {} }, transitions: {}, movements: [], byBusinessType: {}, byCategory: [], byTerritory: {},
    lowConfidence: { flagged: 0, byConfidence: {}, byIndependentSources: {}, withPhoneAndStreetAddress: 0, corroboratedAndAutoUnderB: 0, note: "" },
    invariants: { ok: true, checked: [], violations: [] }, pilot: { autoA: 0, autoB: 0, autoDelta: 0, reviewA: 0, reviewB: 0, reviewReductionPct: 0, blockedA: 0, blockedB: 0, autoBMontrealField: 0, autoBRemote: 0, autoBUnresolvedTerritory: 0, assumptions: [] },
    examplesIncludeNames: includeNames,
  };
  const groups = new Map<string, MovementGroup>();
  const cat = new Map<string, { category: string; total: number; aAuto: number; bAuto: number; bReview: number; bBlocked: number }>();

  rows.forEach((f, i) => {
    const A = resA[i], B = resB[i];
    const la = laneOf(A), lb = laneOf(B);
    rep.a.lanes[la]++; rep.b.lanes[lb]++;
    A.reasons.forEach((r) => bump(rep.a.reasons, r)); B.reasons.forEach((r) => bump(rep.b.reasons, r));
    bump(rep.transitions, `${la}->${lb}`);

    const bt = B.businessType ?? "UNSPECIFIED";
    const t = (rep.byBusinessType[bt] ??= { total: 0, a: lanes0(), b: lanes0() });
    t.total++; t.a[la]++; t.b[lb]++;

    const ck = f.taxonomyPrimary ?? "(none)";
    const c = cat.get(ck) ?? { category: ck, total: 0, aAuto: 0, bAuto: 0, bReview: 0, bBlocked: 0 };
    c.total++; if (la === "AUTO_ELIGIBLE") c.aAuto++; if (lb === "AUTO_ELIGIBLE") c.bAuto++; if (lb === "HUMAN_REVIEW") c.bReview++; if (lb === "BLOCKED") c.bBlocked++;
    cat.set(ck, c);

    const tk = territoryOf(f.territoryKey);
    const tt = (rep.byTerritory[tk] ??= { total: 0, aAuto: 0, bAuto: 0, bReview: 0 });
    tt.total++; if (la === "AUTO_ELIGIBLE") tt.aAuto++; if (lb === "AUTO_ELIGIBLE") tt.bAuto++; if (lb === "HUMAN_REVIEW") tt.bReview++;

    if (f.qualityFlags.includes("LOW_CONFIDENCE")) {
      const lc = rep.lowConfidence;
      lc.flagged++; bump(lc.byConfidence, confBucket(f.sourceConfidence));
      const n = independentSources(f.datasets);
      bump(lc.byIndependentSources, n >= 3 ? "3+" : String(n));
      if (f.phone && f.address) lc.withPhoneAndStreetAddress++;
      if (lb === "AUTO_ELIGIBLE" && B.reasons.includes("CORROBORATED_LOW_CONFIDENCE")) lc.corroboratedAndAutoUnderB++;
    }

    if (la !== lb) {
      const removed = minus(A.reasons, B.reasons), added = minus(B.reasons, A.reasons);
      const cause = `${removed.length ? removed.join(" + ") : "—"} ⇒ ${added.length ? added.join(" + ") : "—"}`;
      const key = `${la}|${lb}|${cause}`;
      const g = groups.get(key) ?? { cause, from: la, to: lb, count: 0, byBusinessType: {}, examples: [] };
      g.count++; bump(g.byBusinessType, bt);
      if (g.examples.length < perGroup) g.examples.push({ label: `${la} → ${lb}`, ...(includeNames ? { name: f.name ?? undefined } : {}), city: f.city, province: f.province, category: f.taxonomyPrimary ?? null, businessType: bt, from: la, to: lb, why: cause });
      groups.set(key, g);
    }
  });

  rep.movements = [...groups.values()].sort((x, y) => (x.to === "AUTO_ELIGIBLE" ? 0 : 1) - (y.to === "AUTO_ELIGIBLE" ? 0 : 1) || y.count - x.count);
  rep.byCategory = [...cat.values()].sort((x, y) => y.total - x.total).slice(0, opts.topCategories ?? 30);

  const inv = violations(rows, resB, rb);
  rep.invariants = {
    ok: inv.length === 0,
    checked: ["disallowed licence", "excluded record", "ambiguous CRM match", "unresolved branch", "chain signal (REVIEW rule)", "source change after approval", "possible dealership service department", "no usable contact/location", "missing provenance", "uncorroborated low confidence"],
    violations: inv,
  };
  const autoA = rep.a.lanes.AUTO_ELIGIBLE, autoB = rep.b.lanes.AUTO_ELIGIBLE, revA = rep.a.lanes.HUMAN_REVIEW, revB = rep.b.lanes.HUMAN_REVIEW;
  const fieldB = rows.filter((f, i) => resB[i].lane === "AUTO_ELIGIBLE" && f.territoryKey === "greater-montreal").length;
  const unresB = rows.filter((f, i) => resB[i].lane === "AUTO_ELIGIBLE" && f.territoryKey === "unresolved").length;
  rep.pilot = {
    autoA, autoB, autoDelta: autoB - autoA, reviewA: revA, reviewB: revB, reviewReductionPct: revA ? Math.round(((revA - revB) / revA) * 1000) / 10 : 0,
    blockedA: rep.a.lanes.BLOCKED, blockedB: rep.b.lanes.BLOCKED, autoBMontrealField: fieldB, autoBRemote: autoB - fieldB - unresB, autoBUnresolvedTerritory: unresB,
    assumptions: [
      "Counts are for the candidates in the qualification pool at the moment of the run (staged, not yet imported, completed run).",
      "AUTO_ELIGIBLE means 'may be imported into the CRM unassigned and then distributed'; it is NOT permission to contact anyone.",
      "Greater Montréal prospects are FIELD-held (assigned to FIELD sellers); the rest are REMOTE. Neither is emailed by automation without a reviewed CASL basis.",
    ],
  };
  rep.lowConfidence.note = "Low-confidence rows that stay in review under B are those without ≥2 independent upstream datasets, a phone AND a street address, and a platform-recognised repair category.";
  return rep;
}

// ── Markdown rendering (shared by the screen download and the read-only CLI) ────────────────────────────────────────────
const n = (x: number) => x.toLocaleString("en-CA");
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "–");
const table = (head: string[], rows: (string | number)[][]) => [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

export function renderComparisonMarkdown(r: ComparisonReport, labels: { a: string; b: string } = { a: "A (V1)", b: "B (V2)" }): string {
  const L = ["AUTO_ELIGIBLE", "HUMAN_REVIEW", "BLOCKED", "OUT_OF_SCOPE"] as const;
  const out: string[] = [];
  out.push(`# Lead Radar qualification — ${labels.a} vs ${labels.b}`, "", `Read-only comparison over **${n(r.evaluated)}** staged candidates. Nothing was imported, assigned, contacted or modified.`, "");
  out.push("## Lane distribution", table(["Lane", labels.a, labels.b, "Δ"], L.map((l) => [l, `${n(r.a.lanes[l])} (${pct(r.a.lanes[l], r.evaluated)})`, `${n(r.b.lanes[l])} (${pct(r.b.lanes[l], r.evaluated)})`, (r.b.lanes[l] - r.a.lanes[l] >= 0 ? "+" : "") + n(r.b.lanes[l] - r.a.lanes[l])])), "");
  out.push("## Safety invariants (must all hold under B)", r.invariants.ok ? `✔ none of the ${r.invariants.checked.length} mandatory-human / integrity rules is bypassed: ${r.invariants.checked.join("; ")}.` : `✖ VIOLATIONS:\n${r.invariants.violations.map((v) => `- ${v.rule}: ${v.count}`).join("\n")}`, "");
  out.push("## Movements and why", table(["From → To", "Cause (V1 reasons cleared ⇒ V2 reasons added)", "Count", "By business type"], r.movements.map((g) => [`${g.from} → ${g.to}`, g.cause, n(g.count), Object.entries(g.byBusinessType).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(", ")])), "");
  const ex = r.movements.flatMap((g) => g.examples);
  if (ex.length) out.push("## Representative examples", table(["Movement", "Business", "City", "Category", "Type", "Why"], ex.map((e) => [`${e.from} → ${e.to}`, r.examplesIncludeNames ? (e.name ?? "—") : "(names hidden — rerun with --include-names)", e.city ?? "—", e.category ?? "—", e.businessType, e.why])), "");
  out.push("## By business type", table(["Type", "Total", `${labels.a} auto`, `${labels.b} auto`, `${labels.b} review`, `${labels.b} blocked`], Object.entries(r.byBusinessType).sort((x, y) => y[1].total - x[1].total).map(([k, v]) => [k, n(v.total), n(v.a.AUTO_ELIGIBLE), n(v.b.AUTO_ELIGIBLE), n(v.b.HUMAN_REVIEW), n(v.b.BLOCKED)])), "");
  out.push("## By taxonomy category (top)", table(["Category", "Total", `${labels.a} auto`, `${labels.b} auto`, `${labels.b} review`, `${labels.b} blocked`], r.byCategory.map((c) => [c.category, n(c.total), n(c.aAuto), n(c.bAuto), n(c.bReview), n(c.bBlocked)])), "");
  out.push("## By territory", table(["Territory", "Total", `${labels.a} auto`, `${labels.b} auto`, `${labels.b} review`], Object.entries(r.byTerritory).map(([k, v]) => [k, n(v.total), n(v.aAuto), n(v.bAuto), n(v.bReview)])), "");
  const lc = r.lowConfidence;
  out.push("## Low source confidence (diagnostic)", `${n(lc.flagged)} candidates carry the LOW_CONFIDENCE flag; ${n(lc.withPhoneAndStreetAddress)} of them have a phone and a street address; ${n(lc.corroboratedAndAutoUnderB)} qualify automatically under ${labels.b} through independent corroboration.`,
    "", table(["Confidence", "Count"], Object.entries(lc.byConfidence).map(([k, v]) => [k, n(v)])), "", table(["Independent upstream datasets", "Count"], Object.entries(lc.byIndependentSources).map(([k, v]) => [k, n(v)])), "", lc.note, "");
  const p = r.pilot;
  out.push("## Estimated impact on the Québec pilot", table(["Measure", labels.a, labels.b], [["Auto-qualified (CRM-importable)", n(p.autoA), n(p.autoB)], ["Awaiting human review", n(p.reviewA), n(p.reviewB)], ["Blocked", n(p.blockedA), n(p.blockedB)]]), "", `Review workload change: **${p.reviewReductionPct}%** fewer reviews (${n(p.reviewA)} → ${n(p.reviewB)}). Under ${labels.b}: ${n(p.autoBMontrealField)} auto candidates are Greater Montréal (FIELD), ${n(p.autoBRemote)} are rest-of-Canada (REMOTE), ${n(p.autoBUnresolvedTerritory)} unresolved territory.`, "", ...p.assumptions.map((a) => `- ${a}`), "");
  out.push("## Reasons (counts may overlap)", table(["Reason", labels.a, labels.b], [...new Set([...Object.keys(r.a.reasons), ...Object.keys(r.b.reasons)])].sort().map((k) => [k, n(r.a.reasons[k] ?? 0), n(r.b.reasons[k] ?? 0)])), "");
  return out.join("\n");
}
