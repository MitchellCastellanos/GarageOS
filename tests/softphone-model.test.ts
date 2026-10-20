// Floating softphone pure model: display-mode persistence (only the mode, guarded storage) and lock derivation.
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MODE, DISPLAY_MODE_KEY, controlsFor, deriveLocks, effectiveMode, parseMode, phaseTone, readMode, writeMode, type LockInput } from "../src/components/sales-calling/softphone-model";

const base: LockInput = { phase: "idle", hasProspect: true, dispoPending: false, gateOpen: true, doNotContact: false, heldProvince: false, hasPhone: true };

test("parseMode accepts only the three modes", () => {
  assert.equal(parseMode("compact"), "compact");
  assert.equal(parseMode("minimized"), "minimized");
  assert.equal(parseMode("weird"), DEFAULT_MODE);
  assert.equal(parseMode(null), DEFAULT_MODE);
});

test("readMode / writeMode store only the display mode and survive broken storage", () => {
  const m = new Map<string, string>();
  const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  assert.equal(readMode(store), "expanded");
  assert.equal(writeMode(store, "minimized"), true);
  assert.deepEqual([...m.keys()], [DISPLAY_MODE_KEY]);
  assert.equal(readMode(store), "minimized");
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(readMode(broken), DEFAULT_MODE);
  assert.equal(writeMode(broken, "compact"), false);
  assert.equal(readMode(null), DEFAULT_MODE);
  assert.equal(writeMode(undefined, "compact"), false);
});

test("an idle prospect with open gates can be called and Next is free", () => {
  const l = deriveLocks(base);
  assert.equal(l.callLocked, false); assert.equal(l.callReason, null); assert.equal(l.nextLocked, false); assert.equal(l.outcomeDue, false);
});

test("a pending outcome locks Call and Next", () => {
  const l = deriveLocks({ ...base, phase: "ended", dispoPending: true });
  assert.equal(l.callLocked, true); assert.equal(l.callReason, "pending"); assert.equal(l.nextLocked, true); assert.equal(l.nextReason, "blockedDispo"); assert.equal(l.outcomeDue, true);
});

test("a live call locks Call and Next", () => {
  for (const phase of ["authorizing", "dialing", "ringing", "connected"] as const) {
    const l = deriveLocks({ ...base, phase });
    assert.equal(l.callLocked, true, phase); assert.equal(l.nextReason, "blockedLive", phase); assert.equal(l.callActive, true, phase);
  }
  assert.equal(deriveLocks({ ...base, phase: "connected" }).live, true);
  assert.equal(deriveLocks({ ...base, phase: "authorizing" }).live, false);
});

test("call lock reasons follow the server's precedence", () => {
  assert.equal(deriveLocks({ ...base, hasProspect: false }).callReason, "noProspect");
  assert.equal(deriveLocks({ ...base, gateOpen: false }).callReason, "gate");
  assert.equal(deriveLocks({ ...base, gateOpen: false, dispoPending: true }).callReason, "pending");
  assert.equal(deriveLocks({ ...base, doNotContact: true }).callReason, "dnc");
  assert.equal(deriveLocks({ ...base, heldProvince: true }).callReason, "held");
  assert.equal(deriveLocks({ ...base, hasPhone: false }).callReason, "noPhone");
});

test("phase tones and effective mode", () => {
  assert.equal(phaseTone("connected"), "live");
  assert.equal(phaseTone("ringing"), "busy");
  assert.equal(phaseTone("failed"), "failed");
  assert.equal(phaseTone("idle"), "idle");
  assert.equal(effectiveMode("minimized", null), "minimized");
  assert.equal(effectiveMode("minimized", "expanded"), "expanded");
});

test("controls per mode: the outcome form only in the expanded phone, the warning badge everywhere", () => {
  const pending = { live: false, callActive: false, outcomeDue: true };
  assert.equal(controlsFor("expanded", pending).outcomeForm, true);
  assert.equal(controlsFor("compact", pending).outcomeForm, false);
  assert.equal(controlsFor("minimized", pending).outcomeBadge, true);
  const live = { live: true, callActive: true, outcomeDue: false };
  assert.equal(controlsFor("minimized", live).hangUp, true);
  assert.equal(controlsFor("minimized", live).mute, false);
  assert.equal(controlsFor("compact", live).mute, true);
  assert.equal(controlsFor("expanded", live).call, false);
  assert.equal(controlsFor("expanded", { live: false, callActive: false, outcomeDue: false }).call, true);
});

test("hold control follows the live call: shown while live in expanded/compact, never minimized or idle", () => {
  const live = { live: true, callActive: true, outcomeDue: false }, idle = { live: false, callActive: false, outcomeDue: false };
  assert.equal(controlsFor("expanded", live).hold, true); assert.equal(controlsFor("compact", live).hold, true);
  assert.equal(controlsFor("minimized", live).hold, false); assert.equal(controlsFor("expanded", idle).hold, false);
});
