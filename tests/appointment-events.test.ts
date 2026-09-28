import assert from "node:assert/strict";
import test from "node:test";
import { decideAppointmentEditEvent, diffAppointmentFields } from "../src/domain/appointment-events.js";

const monday = new Date("2026-10-05T14:00:00.000Z");
const tuesday = new Date("2026-10-06T13:00:00.000Z");

test("diff only records fields that actually changed, with dates serialized", () => {
  const changes = diffAppointmentFields(
    { startsAt: monday, title: "Oil change", notes: null, mechanicId: "m1" },
    { startsAt: tuesday, title: "Oil change", notes: "", mechanicId: "m1" }
  );
  assert.deepEqual(Object.keys(changes).sort(), ["notes", "startsAt"]);
  assert.deepEqual(changes.startsAt, { from: monday.toISOString(), to: tuesday.toISOString() });
});

test("same date instance values produce no change", () => {
  assert.deepEqual(diffAppointmentFields({ startsAt: monday }, { startsAt: new Date(monday) }), {});
});

test("rescheduling an active appointment notifies the client with an update", () => {
  const changes = diffAppointmentFields({ startsAt: monday }, { startsAt: tuesday });
  assert.deepEqual(decideAppointmentEditEvent("CONFIRMED", "CONFIRMED", changes), {
    type: "RESCHEDULED",
    notice: "update",
  });
});

test("changing the service notifies; internal-only edits do not", () => {
  assert.deepEqual(
    decideAppointmentEditEvent("SCHEDULED", "SCHEDULED", { title: { from: "A", to: "B" } }),
    { type: "UPDATED", notice: "update" }
  );
  assert.deepEqual(
    decideAppointmentEditEvent("SCHEDULED", "SCHEDULED", { mechanicId: { from: "m1", to: "m2" } }),
    { type: "UPDATED", notice: null }
  );
});

test("cancelling from the edit form sends a cancellation", () => {
  assert.deepEqual(
    decideAppointmentEditEvent("CONFIRMED", "CANCELLED", { status: { from: "CONFIRMED", to: "CANCELLED" } }),
    { type: "CANCELLED", notice: "cancellation" }
  );
});

test("reopening a cancelled appointment re-sends the confirmation", () => {
  assert.deepEqual(
    decideAppointmentEditEvent("CANCELLED", "SCHEDULED", { status: { from: "CANCELLED", to: "SCHEDULED" } }),
    { type: "REOPENED", notice: "confirmation" }
  );
});

test("reassigning to another client confirms with the new client", () => {
  assert.deepEqual(
    decideAppointmentEditEvent("SCHEDULED", "SCHEDULED", { clientId: { from: "c1", to: "c2" } }),
    { type: "UPDATED", notice: "confirmation" }
  );
});

test("completing or marking no-show is logged without notifying", () => {
  assert.deepEqual(
    decideAppointmentEditEvent("CONFIRMED", "COMPLETED", { status: { from: "CONFIRMED", to: "COMPLETED" } }),
    { type: "STATUS_CHANGED", notice: null }
  );
  assert.deepEqual(
    decideAppointmentEditEvent("SCHEDULED", "NO_SHOW", {
      status: { from: "SCHEDULED", to: "NO_SHOW" },
      startsAt: { from: "a", to: "b" },
    }),
    { type: "STATUS_CHANGED", notice: null }
  );
});
