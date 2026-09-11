import assert from "node:assert/strict";
import test from "node:test";
import { formatClientName } from "../src/domain/client-name.js";
import { canTransitionWorkOrder } from "../src/domain/work-order.js";

test("supports business customers and trimmed personal names", () => {
  assert.equal(formatClientName({ firstName: " Fleet Inc. ", lastName: null }), "Fleet Inc.");
  assert.equal(formatClientName({ firstName: " Anne ", lastName: " Roy " }), "Anne Roy");
});

test("a job cannot skip approval or be invoiced before completion", () => {
  assert.equal(canTransitionWorkOrder("OPEN", "IN_PROGRESS"), false);
  assert.equal(canTransitionWorkOrder("IN_PROGRESS", "INVOICED"), false);
  assert.equal(canTransitionWorkOrder("INVOICED", "OPEN"), false);
  assert.equal(canTransitionWorkOrder("CANCELLED", "APPROVED"), false);
});

test("supports the approved job flow and renewed approval for scope changes", () => {
  assert.equal(canTransitionWorkOrder("OPEN", "AWAITING_APPROVAL"), true);
  assert.equal(canTransitionWorkOrder("AWAITING_APPROVAL", "APPROVED"), true);
  assert.equal(canTransitionWorkOrder("APPROVED", "IN_PROGRESS"), true);
  assert.equal(canTransitionWorkOrder("IN_PROGRESS", "AWAITING_APPROVAL"), true);
  assert.equal(canTransitionWorkOrder("IN_PROGRESS", "COMPLETED"), true);
  assert.equal(canTransitionWorkOrder("COMPLETED", "INVOICED"), true);
});
