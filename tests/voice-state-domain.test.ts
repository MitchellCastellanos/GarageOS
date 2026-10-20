// Call-session state machine + secret storage — pure.
import assert from "node:assert/strict";
import test from "node:test";
import { isTerminal, nextState, stateFromTwilio } from "../src/domain/voice/state";
import { decryptSecret, encryptSecret } from "../src/lib/voice/crypto";
import { maskNumber } from "../src/lib/voice/types";

test("Twilio status mapping", () => {
  assert.equal(stateFromTwilio("initiated"), "PENDING"); assert.equal(stateFromTwilio("ringing"), "RINGING"); assert.equal(stateFromTwilio("in-progress"), "IN_PROGRESS");
  assert.equal(stateFromTwilio("completed"), "COMPLETED"); assert.equal(stateFromTwilio("busy"), "BUSY"); assert.equal(stateFromTwilio("no-answer"), "NO_ANSWER");
  assert.equal(stateFromTwilio("failed"), "FAILED"); assert.equal(stateFromTwilio("canceled"), "CANCELED"); assert.equal(stateFromTwilio("weird"), null); assert.equal(stateFromTwilio(null), null);
});

test("state only moves forward; terminal is final; late, duplicate and unknown events change nothing", () => {
  assert.equal(nextState("PENDING", "RINGING"), "RINGING");
  assert.equal(nextState("RINGING", "IN_PROGRESS"), "IN_PROGRESS");
  assert.equal(nextState("IN_PROGRESS", "RINGING"), "IN_PROGRESS", "ringing after answer is a late event");
  assert.equal(nextState("IN_PROGRESS", "PENDING"), "IN_PROGRESS");
  assert.equal(nextState("RINGING", "RINGING"), "RINGING");
  assert.equal(nextState("RINGING", null), "RINGING");
  for (const t of ["COMPLETED", "BUSY", "NO_ANSWER", "FAILED", "CANCELED", "ABANDONED"] as const) {
    assert.equal(isTerminal(t), true);
    assert.equal(nextState(t, "IN_PROGRESS"), t); assert.equal(nextState(t, "COMPLETED"), t); assert.equal(nextState(t, "FAILED"), t);
  }
  assert.equal(nextState("PENDING", "NO_ANSWER"), "NO_ANSWER");
  assert.equal(nextState("IN_PROGRESS", "COMPLETED"), "COMPLETED");
});

test("API-key secret at rest: AES-GCM round trip, tamper and wrong key fail, ciphertext never contains the secret", () => {
  process.env.AUTH_SECRET = "unit-test-secret-unit-test-secret-1234";
  const blob = encryptSecret("super-secret-value");
  assert.ok(!blob.includes("super-secret-value"));
  assert.equal(decryptSecret(blob), "super-secret-value");
  assert.notEqual(encryptSecret("super-secret-value"), blob, "random IV");
  const parts = blob.split("."); parts[3] = Buffer.from("tampered").toString("base64");
  assert.throws(() => decryptSecret(parts.join(".")));
  process.env.AUTH_SECRET = "another-secret-another-secret-9999999";
  assert.throws(() => decryptSecret(blob));
  assert.throws(() => decryptSecret("garbage"));
});

test("numbers shown in the browser are masked", () => {
  assert.equal(maskNumber("+14165551234").includes("555"), false);
  assert.ok(maskNumber("+14165551234").endsWith("34"));
});
