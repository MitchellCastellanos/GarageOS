import assert from "node:assert/strict";
import test from "node:test";
import { scoreAudit, type AuditLabel } from "../src/domain/lead-radar/c2-audit";

const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}` }));
const sample = { VERIFIED_REPAIR: ids("v", 50), EXCLUDED: ids("e", 50), HUMAN_REVIEW: ids("h", 25), MATCHES: ids("m", 10) };
const lab = (p: string, n: number, bucket: string, from = 0): Record<string, AuditLabel> => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${p}${from + i}`, { bucket }]));

test("C2 scoring: precision, exclusion error and incorrect matches against the documented thresholds; nothing is claimed for unlabelled rows or unchecked websites", () => {
  const labels = { ...lab("v", 40, "REAL_REPAIR"), ...lab("v", 5, "RELEVANT_SPECIALIZED", 40), ...lab("v", 3, "COMMERCIALLY_UNSUITABLE", 45), ...lab("v", 2, "NOT_REPAIR", 48), ...lab("e", 47, "CORRECT_EXCLUSION"), ...lab("e", 3, "WRONG_EXCLUSION", 47), ...lab("h", 25, "AMBIGUOUS"), ...lab("m", 10, "CORRECT_DUPLICATE") };
  const s = scoreAudit(sample, labels);
  assert.equal(s.verified.strictPrecision, 0.8); assert.equal(s.verified.lenientPrecision, 0.9);
  assert.deepEqual([s.verdicts.verifiedPrecision, s.verdicts.excludedError, s.verdicts.matches], ["GO", "GO", "GO"]);
  assert.equal(s.excluded.wrongExclusionRate, 0.06); assert.equal(s.unlabelled, 0); assert.equal(s.websitesChecked, 0);
});

test("C2 scoring: borderline, stop and incomplete states; one incorrect match stops", () => {
  const base = { ...lab("e", 50, "CORRECT_EXCLUSION"), ...lab("h", 25, "AMBIGUOUS"), ...lab("m", 10, "CORRECT_MATCH") };
  assert.equal(scoreAudit(sample, { ...base, ...lab("v", 43, "REAL_REPAIR"), ...lab("v", 7, "NOT_REPAIR", 43) }).verdicts.verifiedPrecision, "BORDERLINE");
  assert.equal(scoreAudit(sample, { ...base, ...lab("v", 40, "REAL_REPAIR"), ...lab("v", 10, "NOT_REPAIR", 40) }).verdicts.verifiedPrecision, "STOP");
  assert.equal(scoreAudit(sample, { ...base, ...lab("v", 30, "REAL_REPAIR") }).verdicts.verifiedPrecision, "INCOMPLETE");
  assert.equal(scoreAudit(sample, { ...base, ...lab("v", 50, "REAL_REPAIR"), m0: { bucket: "INCORRECT_MATCH" } }).verdicts.matches, "STOP");
  assert.equal(scoreAudit(sample, { ...base, ...lab("v", 50, "REAL_REPAIR"), e0: { bucket: "WRONG_EXCLUSION" }, ...lab("e", 5, "WRONG_EXCLUSION", 1) }).verdicts.excludedError, "STOP");
  assert.equal(scoreAudit(sample, { ...base, v0: { bucket: "REAL_REPAIR", websiteChecked: true } }).websitesChecked, 1);
});

test("C2 scoring (independent-repair ICP): a chain inside VERIFIED_REPAIR is its own miss and stops; the ICP exclusion is scored on the rows the gate excluded", () => {
  const icp = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, evidence: { currentReasons: i < 20 ? ["OUTSIDE_ICP_CHAIN_OR_CORPORATE", "ICP_BRAND_NAPA"] : ["NAME_SIGNAL_CAR_WASH"] } }));
  const smp = { ...sample, EXCLUDED: icp(50) };
  const base = { ...lab("h", 25, "AMBIGUOUS"), ...lab("m", 10, "CORRECT_MATCH") };
  const good = { ...base, ...lab("v", 50, "REAL_REPAIR"), ...lab("e", 20, "CORRECT_EXCLUSION_CHAIN"), ...lab("e", 30, "CORRECT_EXCLUSION", 20) };
  const ok = scoreAudit(smp, good);
  assert.deepEqual([ok.verdicts.chainLeakage, ok.verdicts.icpExclusion, ok.icp.excludedByIcp.n, ok.icp.chainLeakage], ["GO", "GO", 20, 0]);
  const leak = scoreAudit(smp, { ...good, ...lab("v", 1, "CHAIN_OR_CORPORATE", 49) });
  assert.equal(leak.icp.chainLeakage, 1); assert.equal(leak.verdicts.chainLeakage, "STOP"); assert.equal(leak.icp.independentShareOfVerified, 0.98);
  const wrong = scoreAudit(smp, { ...good, ...lab("e", 2, "WRONG_EXCLUSION", 0) });
  assert.equal(wrong.verdicts.icpExclusion, "STOP"); assert.equal(wrong.icp.excludedByIcp.wrong, 2);
  assert.equal(scoreAudit(sample, good).verdicts.icpExclusion, "INCOMPLETE", "nothing to judge when the sample holds no ICP exclusion");
});
