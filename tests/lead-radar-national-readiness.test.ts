import assert from "node:assert/strict";
import test from "node:test";
import { actionsFor, conversion, deriveStage, nextAutomationTick, nextWorkerCheck, type StageInput } from "../src/domain/lead-radar/national-readiness";

const base: StageInput = { active: null, latest: { status: "COMPLETED", qualityVerdict: "OK", errorCode: null }, stagedTotal: 100, deferred: 0, failed: 0, unclassified: 0 };

test("a finished extraction is NOT a finished province: unfinished downstream work keeps it PROCESSING", () => {
  assert.equal(deriveStage(base), "READY");
  assert.equal(deriveStage({ ...base, deferred: 3 }), "PROCESSING");
  assert.equal(deriveStage({ ...base, failed: 1 }), "PROCESSING");
  assert.equal(deriveStage({ ...base, unclassified: 1 }), "PROCESSING");
});

test("run states map to honest stages", () => {
  assert.equal(deriveStage({ ...base, latest: null, stagedTotal: 0 }), "NOT_STARTED");
  assert.equal(deriveStage({ ...base, active: { execution: "WORKER", status: "PLANNED", claimed: false, attempts: 0 } }), "QUEUED");
  assert.equal(deriveStage({ ...base, active: { execution: "WORKER", status: "INGESTING", claimed: false, attempts: 1 } }), "RETRYING");
  assert.equal(deriveStage({ ...base, active: { execution: "WORKER", status: "INGESTING", claimed: true, attempts: 0 } }), "EXTRACTING");
  assert.equal(deriveStage({ ...base, active: { execution: "MANUAL", status: "INGESTING", claimed: false, attempts: 0 } }), "EXTRACTING");
  assert.equal(deriveStage({ ...base, latest: { status: "FAILED", qualityVerdict: "NO_COORDINATES", errorCode: "NO_COORDINATES" } }), "STOPPED_BY_GATE");
  assert.equal(deriveStage({ ...base, latest: { status: "FAILED", qualityVerdict: null, errorCode: "WORKER_RETRIES_EXHAUSTED" } }), "EXTRACTION_FAILED");
});

test("actions are specific and never a generic success", () => {
  const z = { failed: 0, deferred: 0, unclassified: 0, prospectsMissingCoordinates: 0, automationEnabled: true };
  assert.deepEqual(actionsFor("READY", z), []);
  assert.deepEqual(actionsFor("STOPPED_BY_GATE", z), ["ACKNOWLEDGE_OR_REEXTRACT"]);
  assert.deepEqual(actionsFor("PROCESSING", { ...z, failed: 2, deferred: 5 }), ["RETRY_FAILED_IMPORTS", "WAIT_FOR_AUTOMATION"]);
  assert.deepEqual(actionsFor("PROCESSING", { ...z, deferred: 5, automationEnabled: false }), ["NO_AUTOMATION_PROGRESS"]);
  assert.deepEqual(actionsFor("READY", { ...z, prospectsMissingCoordinates: 26 }), ["RESOLVE_MISSING_COORDINATES"]);
});

test("conversion rates divide like by like and never divide by zero", () => {
  assert.deepEqual(conversion({ raw: 14525, staged: 10466, verified: 5000, prospects: 476, withCoordinates: 450 }), { rawToStaged: 72.1, stagedToVerified: 47.8, verifiedToProspects: 9.5, prospectsWithCoordinates: 94.5 });
  assert.deepEqual(conversion({ raw: null, staged: 0, verified: 0, prospects: 0, withCoordinates: 0 }), { rawToStaged: null, stagedToVerified: null, verifiedToProspects: null, prospectsWithCoordinates: null });
});

test("next scheduled executions follow the real cron expressions (UTC)", () => {
  assert.equal(nextAutomationTick(new Date("2026-10-16T16:04:10Z")).toISOString(), "2026-10-16T16:15:00.000Z");          // Friday
  assert.equal(nextAutomationTick(new Date("2026-10-16T23:50:00Z")).toISOString(), "2026-10-19T11:00:00.000Z");          // Friday night → Monday
  assert.equal(nextAutomationTick(new Date("2026-10-17T14:00:00Z")).toISOString(), "2026-10-19T11:00:00.000Z");          // Saturday
  assert.equal(nextWorkerCheck(new Date("2026-10-16T16:04:10Z")).toISOString(), "2026-10-16T16:17:00.000Z");
  assert.equal(nextWorkerCheck(new Date("2026-10-16T16:17:00Z")).toISOString(), "2026-10-16T18:17:00.000Z");
});

import { nationalCopy } from "../src/lib/admin-locale/lead-radar-national";
test("national copy: French mirrors English exactly (keys, placeholders, no empty text)", () => {
  const walk = (a: unknown, b: unknown, path: string) => {
    if (typeof a === "string") { assert.equal(typeof b, "string", path); assert.ok((b as string).trim().length > 0, `${path} empty`); assert.deepEqual((a.match(/\{\w+\}/g) ?? []).sort(), ((b as string).match(/\{\w+\}/g) ?? []).sort(), `${path} placeholders`); return; }
    assert.deepEqual(Object.keys(a as object).sort(), Object.keys(b as object).sort(), path);
    for (const k of Object.keys(a as object)) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
  };
  walk(nationalCopy("en"), nationalCopy("fr"), "national");
});
