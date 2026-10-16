import test from "node:test";
import assert from "node:assert/strict";
import {
  APPLY_THRESHOLDS, riskOf, REVIEW_CSV_COLUMNS, csvCell, emptyDetail, emptyIcp, isAmbiguousVerified, mergeBatch, newAcc, recommendApply, toCsv, type PreviewBatch, type ReviewRow,
} from "../src/domain/lead-radar/icp-preview";

const batch = (over: Partial<PreviewBatch> & { next: string | null }): PreviewBatch => {
  const { next, ...rest } = over;
  return { examined: 500, changed: 10, transitions: { "fit:VERIFIED_REPAIR->EXCLUDED": 10 }, icp: { ...emptyIcp(1), newlyExcluded: 10, verifiedAfter: 300, excludedAfter: 100, remainingHumanReview: 100 }, detail: emptyDetail(), poolSize: 1000, nextCursor: next, ...rest };
};
const rev = (kind: ReviewRow["kind"], id: string): ReviewRow => ({ id, kind, risk: "HIGH", name: id, city: null, category: null, domain: null, fit: "EXCLUDED", brand: null, flags: ["WEAK_ALIAS"], reasons: "" });

test("batches fold into exact totals, in order; a replayed or out-of-order batch is ignored (the preview is read-only, so nothing is lost)", () => {
  let acc = newAcc("AB");
  acc = mergeBatch(acc, batch({ next: "c1" }), null);
  const replay = mergeBatch(acc, batch({ next: "c1" }), null);
  assert.equal(replay.examined, 500, "same cursor again: ignored");
  assert.equal(mergeBatch(acc, batch({ next: "c9" }), "zzz").examined, 500, "wrong cursor: ignored");
  acc = mergeBatch(acc, batch({ next: null }), "c1");
  assert.deepEqual([acc.examined, acc.changed, acc.batches, acc.done, acc.cursor, acc.icp.newlyExcluded, acc.transitions["fit:VERIFIED_REPAIR->EXCLUDED"]], [1000, 20, 2, true, null, 20, 20]);
  assert.equal(mergeBatch(acc, batch({ next: null }), null).examined, 1000, "a finished preview accepts nothing more");
});

test("recommendation: INCOMPLETE until every candidate was examined; then GO or NO-GO from documented thresholds, with the reasons", () => {
  let acc = newAcc("AB");
  acc = mergeBatch(acc, batch({ next: "c1" }), null);
  assert.equal(recommendApply(acc).verdict, "INCOMPLETE");
  const done = (detail: ReturnType<typeof emptyDetail>, icp = batch({ next: null }).icp) => mergeBatch(mergeBatch(newAcc("AB"), batch({ next: "c1", detail }), null), batch({ next: null, icp: { ...icp, newlyExcluded: 0, verifiedAfter: 0 } }), "c1");
  const clean = done(emptyDetail());
  assert.equal(recommendApply(clean).verdict, "GO");
  const many = done({ ...emptyDetail(), review: Array.from({ length: 4 }, (_, i) => rev("QUESTIONABLE_EXCLUSION", `q${i}`)) }); // 4 of 10 newly excluded
  const r = recommendApply(many);
  assert.equal(r.verdict, "NO_GO"); assert.ok(r.reasons.includes("QUESTIONABLE_EXCLUSIONS_HIGH")); assert.equal(r.metrics.questionableShare, 0.4);
  const dom = mergeBatch(newAcc("AB"), batch({ next: null, poolSize: 500, icp: { ...batch({ next: null }).icp, newlyExcludedDomainOnly: 2 } }), null);
  assert.ok(recommendApply(dom).reasons.includes("DOMAIN_ONLY_HIGH"), "2 of 10 on the domain alone exceeds the 5% default");
  const amb = mergeBatch(newAcc("AB"), batch({ next: null, poolSize: 500, detail: { ...emptyDetail(), review: Array.from({ length: 60 }, (_, i) => rev("AMBIGUOUS_VERIFIED", `a${i}`)) } }), null);
  assert.ok(recommendApply(amb).reasons.includes("AMBIGUOUS_VERIFIED_HIGH"), "60 of 300 verified");
  assert.ok(APPLY_THRESHOLDS.domainOnlyShareMax < APPLY_THRESHOLDS.questionableExclusionShareMax);
});

test("ambiguous-verified rule: one strong flag, or two weak ones", () => {
  assert.equal(isAmbiguousVerified(["CHAIN_HINT"]), true);
  assert.equal(isAmbiguousVerified(["MAKE_IN_DOMAIN"]), true);
  assert.equal(isAmbiguousVerified(["SHARED_DOMAIN"]), false);
  assert.equal(isAmbiguousVerified(["NO_REPAIR_WORD", "SHARED_DOMAIN"]), true);
  assert.equal(isAmbiguousVerified([]), false);
});

test("CSV: RFC 4180 quoting, UTF-8 BOM, arrays joined, and spreadsheet formulas neutralised", () => {
  assert.equal(csvCell('He said "hi", ok'), '"He said ""hi"", ok"');
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(csvCell("+1 Garage"), "'+1 Garage");
  assert.equal(csvCell(null), "");
  const csv = toCsv([{ ...rev("QUESTIONABLE_EXCLUSION", "id1"), name: "Carrosserie Éric, Fils", flags: ["A", "B"] }], REVIEW_CSV_COLUMNS);
  assert.ok(csv.startsWith("﻿kind,risk,name,city,category,domain,fit,brand,flags,reasons,id\r\n"));
  assert.ok(csv.includes('"Carrosserie Éric, Fils"') && csv.includes("A | B"));
});

test("risk: weakest-evidence flags are HIGH; policy-consistent heuristics are LOW; the verdict counts HIGH only while the CSV lists both", () => {
  assert.equal(riskOf("QUESTIONABLE_EXCLUSION", ["DOMAIN_ONLY"]), "HIGH");
  assert.equal(riskOf("QUESTIONABLE_EXCLUSION", ["WEAK_ALIAS", "BRAND_PLUS_OWN_NAME"]), "HIGH");
  assert.equal(riskOf("QUESTIONABLE_EXCLUSION", ["DEALER_NAME_PATTERN"]), "LOW");
  assert.equal(riskOf("QUESTIONABLE_EXCLUSION", ["BRAND_PLUS_OWN_NAME"]), "LOW");
  assert.equal(riskOf("AMBIGUOUS_VERIFIED", ["CHAIN_HINT"]), "HIGH");
  assert.equal(riskOf("AMBIGUOUS_VERIFIED", ["NO_REPAIR_WORD", "SHARED_DOMAIN"]), "LOW");
  const low: ReviewRow[] = Array.from({ length: 8 }, (_, i) => ({ ...rev("QUESTIONABLE_EXCLUSION", `l${i}`), risk: "LOW" as const, flags: ["DEALER_NAME_PATTERN"] }));
  const acc = mergeBatch(newAcc("AB"), batch({ next: null, poolSize: 500, detail: { ...emptyDetail(), review: low } }), null);
  const r = recommendApply(acc);
  assert.deepEqual([r.verdict, r.metrics.flaggedExclusions, r.metrics.questionableExclusions], ["GO", 8, 0]);
});
