import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROLLOUT_ASSIGN_PROVINCES, ROLLOUT_EXISTING, ROLLOUT_NEVER, ROLLOUT_PROVINCES, planRollout, provinceStep, safetyViolation, type ProvinceFacts, type SafetyFacts } from "../src/domain/lead-radar/rollout";

const done: ProvinceFacts = { province: "BC", activeRun: false, latestRun: { status: "COMPLETED", verdict: "OK", errorCode: null }, staged: 500, duplicates: 20, unclassified: 0, withPoint: 495, verified: 300, review: 50, excluded: 150, importFailed: 0, approvedNotImported: 0, awaitingQualification: 0, inImportScope: true };
const f = (o: Partial<ProvinceFacts> = {}): ProvinceFacts => ({ ...done, ...o });
const fresh = (province: string): ProvinceFacts => ({ ...done, province, latestRun: null, staged: 0, duplicates: 0, withPoint: 0, verified: 0, review: 0, excluded: 0, inImportScope: false });

test("rollout scope never contains AB or QC; ON is only an assignment province; the order is fixed", () => {
  for (const p of ROLLOUT_NEVER) assert.ok(!ROLLOUT_PROVINCES.includes(p as never), `${p} is never extracted by the rollout`);
  assert.ok(!ROLLOUT_ASSIGN_PROVINCES.includes("QC"), "Québec is never in the assignment scope");
  for (const p of ["ON", "AB"]) { assert.ok(!ROLLOUT_PROVINCES.includes(p as never)); assert.ok(ROLLOUT_ASSIGN_PROVINCES.includes(p), `${p} prospects are assigned`); assert.ok(ROLLOUT_EXISTING.includes(p)); }
  assert.equal(ROLLOUT_PROVINCES.length, 10);
  assert.deepEqual(provinceStep(f({ province: "QC" })).kind, "HALT");
  assert.deepEqual(provinceStep(f({ province: "AB", latestRun: null })).kind, "HALT", "a non-existing AB would never be queued");
});

test("province step: every gate halts with its own code, nothing is skipped silently", () => {
  assert.deepEqual(provinceStep(f()), { kind: "DONE" });
  assert.deepEqual(provinceStep(fresh("MB")), { kind: "QUEUE" });
  assert.deepEqual(provinceStep(f({ activeRun: true })), { kind: "WAIT", why: "EXTRACTING" });
  assert.deepEqual(provinceStep(f({ latestRun: { status: "FAILED", verdict: "LOW_COORDINATE_COVERAGE", errorCode: "LOW_COORDINATE_COVERAGE" } })), { kind: "HALT", code: "EXTRACTION_FAILED", detail: "LOW_COORDINATE_COVERAGE" });
  assert.equal((provinceStep(f({ latestRun: { status: "CANCELLED", verdict: null, errorCode: null } })) as { code: string }).code, "EXTRACTION_CANCELLED");
  assert.equal((provinceStep(f({ importFailed: 2 })) as { code: string }).code, "IMPORT_ERRORS");
  assert.equal((provinceStep(f({ staged: 0 })) as { code: string }).code, "EMPTY_STAGING");
  assert.deepEqual(provinceStep(f({ staged: 0, latestRun: { status: "COMPLETED", verdict: "ZERO_RESULTS_LEGIT", errorCode: null } })), { kind: "DONE", note: "NO_CANDIDATES" });
  assert.deepEqual(provinceStep(f({ unclassified: 3 })), { kind: "WAIT", why: "CLASSIFYING" });
  assert.equal((provinceStep(f({ withPoint: 300 })) as { code: string }).code, "MISSING_COORDINATES");
  assert.equal((provinceStep(f({ duplicates: 900 })) as { code: string }).code, "DUPLICATE_ANOMALY");
  assert.equal((provinceStep(f({ verified: 0 })) as { code: string }).code, "ICP_ANOMALY", "a sizeable province with no verified shop is an anomaly");
  assert.equal((provinceStep(f({ verified: 10, excluded: 490 })) as { code: string }).code, "ICP_ANOMALY");
  assert.equal(provinceStep(f({ staged: 40, withPoint: 40, verified: 0, review: 0, excluded: 40, duplicates: 0 })).kind, "DONE", "tiny samples do not trip the ICP anomaly (territories)");
  assert.deepEqual(provinceStep(f({ inImportScope: false })), { kind: "OPEN_IMPORT" });
  assert.deepEqual(provinceStep(f({ approvedNotImported: 5 })), { kind: "IMPORTING" });
  assert.deepEqual(provinceStep(f({ awaitingQualification: 5 })), { kind: "IMPORTING" });
});

test("plan: extraction is strictly sequential, import opens as soon as a province passes, the first halt wins, finished only when every province is done", () => {
  const all = ROLLOUT_PROVINCES.map((p) => fresh(p));
  assert.equal(planRollout(all).queue, "BC", "the first province is queued, only one");
  const bcRunning = all.map((x) => (x.province === "BC" ? { ...x, activeRun: true } : x));
  assert.equal(planRollout(bcRunning).queue, null, "nothing is queued while a rollout extraction is active");
  const bcDone = all.map((x) => (x.province === "BC" ? f({ province: "BC", inImportScope: false }) : x));
  const p = planRollout(bcDone);
  assert.deepEqual([p.queue, p.openImport], ["MB", ["BC"]], "BC opens for import and the next province is queued in the same cycle");
  const halted = planRollout(all.map((x) => (x.province === "BC" ? f({ province: "BC", importFailed: 1 }) : x)));
  assert.deepEqual([halted.halt?.province, halted.halt?.code, halted.queue], ["BC", "IMPORT_ERRORS", null], "a halt queues and opens nothing");
  assert.equal(planRollout(ROLLOUT_PROVINCES.map((p) => f({ province: p }))).finished, true);
  assert.equal(planRollout(ROLLOUT_PROVINCES.map((p, i) => (i ? f({ province: p }) : f({ province: p, approvedNotImported: 1 })))).finished, false, "still importing is not finished");
});

const okSafety: SafetyFacts = {
  settings: { eligibilityEnabled: false, releaseUnavailable: false, pilotEnabled: false, sendingEnabled: false, assignStaffIds: ["rep"], rolloutStaffId: "rep", importProvincesIncludeAll: false },
  seller: { active: true, role: "SALES_REP", superAdminLogin: false, acceptsAutoAssignment: true }, hasActivePolicy: true, violations: { outOfScope: 0, otherSeller: 0, fieldMode: 0 },
};
test("safety: pilot, sending, an empty import scope, a wrong allow-list/seller and any out-of-scope, other-seller or FIELD assignment each halt", () => {
  assert.equal(safetyViolation(okSafety), null);
  const code = (o: Partial<SafetyFacts> & { settings?: Partial<SafetyFacts["settings"]> }) => safetyViolation({ ...okSafety, ...o, settings: { ...okSafety.settings, ...(o.settings ?? {}) } })?.code;
  assert.equal(code({ hasActivePolicy: false }), "NO_ACTIVE_POLICY");
  assert.equal(code({ settings: { pilotEnabled: true } as never }), "SETTINGS_UNSAFE");
  assert.equal(code({ settings: { sendingEnabled: true } as never }), "SETTINGS_UNSAFE");
  assert.equal(code({ settings: { importProvincesIncludeAll: true } as never }), "SETTINGS_UNSAFE");
  assert.equal(code({ settings: { assignStaffIds: ["rep", "other"] } as never }), "SELLER_INVALID", "exclusively one seller");
  assert.equal(code({ settings: { assignStaffIds: [] } as never }), "SELLER_INVALID");
  assert.equal(code({ seller: null }), "SELLER_INVALID");
  assert.equal(code({ seller: { ...okSafety.seller!, superAdminLogin: true } }), "SELLER_INVALID");
  assert.equal(code({ seller: { ...okSafety.seller!, role: "SALES_MANAGER" } }), "SELLER_INVALID");
  assert.equal(code({ seller: { ...okSafety.seller!, active: false } }), "SELLER_INVALID");
  for (const v of [{ outOfScope: 1 }, { otherSeller: 1 }, { fieldMode: 1 }]) assert.equal(code({ violations: { ...okSafety.violations, ...v } }), "ASSIGNMENT_SAFETY");
});

test("wiring: the tick forces release and pilot OFF during the rollout, lets read-only eligibility follow its own switch (contact-bearing prospects only), and and scopes assignment to REMOTE rollout provinces; no outreach import exists in the rollout module", () => {
  const auto = readFileSync("src/lib/lead-radar/automation.ts", "utf8");
  // Eligibility is read-only advice: it follows its OWN switch (activation still sets it OFF; nothing here turns it on) and, during the rollout, only assesses prospects with an emailable contact.
  assert.match(auto, /stage\("eligibility", a\.eligibilityEnabled, \(deadline\) => refreshEligibility\(\{ deadline, requireContact: a\.rolloutEnabled \}\)\)/);
  assert.match(auto, /stage\("release", a\.releaseUnavailable && !a\.rolloutEnabled/);
  assert.match(auto, /stage\("pilot", a\.pilotEnabled && !a\.rolloutEnabled/);
  assert.match(auto, /a\.rolloutEnabled \? \{ provinces: ROLLOUT_ASSIGN_PROVINCES, remoteOnly: true \} : null/);
  assert.match(auto, /stage\("rollout", a\.rolloutEnabled && !a\.rolloutPaused/);
  const ro = readFileSync("src/lib/lead-radar/rollout.ts", "utf8");
  assert.ok(!/sequences|enrollAutomated|sendEmail|sms|twilio|resend/i.test(ro), "the rollout module cannot send or enroll anything");
});

const existing = (province: string, o: Partial<ProvinceFacts> = {}): ProvinceFacts => ({ ...done, province, existing: true, ...o });

test("existing provinces (ON, AB): never queued or gated again, but they must finish import; their old failed runs or odd ratios do not halt", () => {
  assert.deepEqual(provinceStep(existing("AB", { latestRun: null, inImportScope: false })), { kind: "OPEN_IMPORT" });
  assert.deepEqual(provinceStep(existing("ON", { latestRun: { status: "FAILED", verdict: "HIGH_REJECTION", errorCode: null }, duplicates: 9000, withPoint: 1 })), { kind: "DONE" }, "no extraction gates for provinces extracted before the rollout");
  assert.deepEqual(provinceStep(existing("AB", { approvedNotImported: 2189 })), { kind: "IMPORTING" });
  assert.deepEqual(provinceStep(existing("ON", { awaitingQualification: 10 })), { kind: "IMPORTING" });
  assert.equal((provinceStep(existing("AB", { importFailed: 1 })) as { code: string }).code, "IMPORT_ERRORS");
  const plan = planRollout([existing("ON"), existing("AB"), ...ROLLOUT_PROVINCES.map((p) => fresh(p))]);
  assert.equal(plan.queue, "BC", "AB is never queued; the first rollout province is");
});

test("completion: finishing every extraction does NOT complete the rollout; qualification, import and assignment of ON, AB and the new provinces must all finish", () => {
  const allDone = [existing("ON"), existing("AB"), ...ROLLOUT_PROVINCES.map((p) => f({ province: p }))];
  assert.equal(planRollout(allDone, 0).finished, true);
  const noAssign = planRollout(allDone, 1);
  assert.deepEqual([noAssign.finished, noAssign.waitingForAssignment], [false, true], "assignable REMOTE prospects still unassigned: not complete");
  assert.equal(planRollout([existing("ON"), existing("AB", { approvedNotImported: 1 }), ...ROLLOUT_PROVINCES.map((p) => f({ province: p }))], 0).finished, false, "AB still importing");
  assert.equal(planRollout([existing("ON", { awaitingQualification: 1 }), existing("AB"), ...ROLLOUT_PROVINCES.map((p) => f({ province: p }))], 0).finished, false, "ON still qualifying");
  assert.equal(planRollout([existing("ON"), existing("AB"), ...ROLLOUT_PROVINCES.map((p, i) => (i ? f({ province: p }) : f({ province: p, awaitingQualification: 3 })))], 0).finished, false, "a new province still qualifying");
  assert.equal(planRollout([existing("ON"), existing("AB"), ...ROLLOUT_PROVINCES.map((p, i) => (i ? f({ province: p }) : f({ province: p, activeRun: true })))], 0).finished, false, "an extraction still running");
  // Human-review candidates are neither "awaiting qualification" nor "approved": they stay pending without blocking.
  assert.equal(planRollout([existing("ON", { review: 400 }), existing("AB", { review: 900 }), ...ROLLOUT_PROVINCES.map((p) => f({ province: p, review: 80 }))], 0).finished, true);
});
