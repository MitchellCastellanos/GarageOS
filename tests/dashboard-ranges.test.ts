import assert from "node:assert/strict";
import test from "node:test";
import { getDashboardRanges, shopMonthOf } from "../src/lib/dashboard-ranges";

const MTL = "America/Montreal";
const iso = (d: Date) => d.toISOString();

test("day boundaries follow the shop zone, not UTC (Montreal EDT, UTC-4)", () => {
  // 23:30 in Montreal on Oct 7 is already Oct 8 in UTC: it is still "today" Oct 7 for the shop.
  const late = getDashboardRanges(new Date("2026-10-08T03:30:00Z"), MTL);
  assert.equal(late.today, "2026-10-07");
  assert.equal(iso(late.startOfDay), "2026-10-07T04:00:00.000Z");
  assert.equal(iso(late.endOfDay), "2026-10-08T04:00:00.000Z");

  // One second after local midnight the day flips.
  const flipped = getDashboardRanges(new Date("2026-10-08T04:00:01Z"), MTL);
  assert.equal(flipped.today, "2026-10-08");
  assert.equal(iso(flipped.startOfDay), "2026-10-08T04:00:00.000Z");

  // 00:30 in Montreal is still the previous day in UTC-based math.
  const early = getDashboardRanges(new Date("2026-10-08T04:30:00Z"), MTL);
  assert.equal(early.today, "2026-10-08");
});

test("month boundaries follow the shop zone", () => {
  const lastNight = getDashboardRanges(new Date("2026-11-01T03:30:00Z"), MTL); // Oct 31 23:30 EDT
  assert.equal(lastNight.month, "2026-10");
  assert.equal(iso(lastNight.startOfMonth), "2026-10-01T04:00:00.000Z");
  assert.equal(iso(lastNight.startOfLastMonth), "2026-09-01T04:00:00.000Z");

  const firstMinutes = getDashboardRanges(new Date("2026-11-01T04:30:00Z"), MTL); // Nov 1 00:30 EDT
  assert.equal(firstMinutes.month, "2026-11");
  assert.equal(iso(firstMinutes.startOfMonth), "2026-11-01T04:00:00.000Z");
  assert.equal(iso(firstMinutes.startOfLastMonth), "2026-10-01T04:00:00.000Z");
});

test("a payment at the month edge lands in the shop's month", () => {
  assert.equal(shopMonthOf(new Date("2026-11-01T03:59:59Z"), MTL), "2026-10");
  assert.equal(shopMonthOf(new Date("2026-11-01T04:00:00Z"), MTL), "2026-11");
  // Dec 31 23:30 EST (UTC-5) is already Jan 1 in UTC but still December for the shop.
  assert.equal(shopMonthOf(new Date("2027-01-01T04:30:00Z"), MTL), "2026-12");
});

test("DST fall back: Nov 1 2026 lasts 25 hours; month start shifts from UTC-4 to UTC-5", () => {
  const r = getDashboardRanges(new Date("2026-11-01T12:00:00Z"), MTL);
  assert.equal(r.today, "2026-11-01");
  assert.equal(iso(r.startOfDay), "2026-11-01T04:00:00.000Z"); // EDT
  assert.equal(iso(r.endOfDay), "2026-11-02T05:00:00.000Z"); // EST
  assert.equal((r.endOfDay.getTime() - r.startOfDay.getTime()) / 3_600_000, 25);

  const dec = getDashboardRanges(new Date("2026-12-15T15:00:00Z"), MTL);
  assert.equal(iso(dec.startOfMonth), "2026-12-01T05:00:00.000Z"); // EST
  assert.equal(iso(dec.startOfLastMonth), "2026-11-01T04:00:00.000Z"); // Nov 1 is still EDT at 00:00
});

test("DST spring forward: Mar 8 2026 lasts 23 hours", () => {
  const r = getDashboardRanges(new Date("2026-03-08T15:00:00Z"), MTL);
  assert.equal(r.today, "2026-03-08");
  assert.equal(iso(r.startOfDay), "2026-03-08T05:00:00.000Z"); // EST
  assert.equal(iso(r.endOfDay), "2026-03-09T04:00:00.000Z"); // EDT
  assert.equal((r.endOfDay.getTime() - r.startOfDay.getTime()) / 3_600_000, 23);
  assert.equal(iso(r.startOfMonth), "2026-03-01T05:00:00.000Z");
  assert.equal(iso(getDashboardRanges(new Date("2026-04-02T15:00:00Z"), MTL).startOfLastMonth), "2026-03-01T05:00:00.000Z");
});

test("six-month window crosses DST and year boundaries", () => {
  const r = getDashboardRanges(new Date("2027-01-01T05:30:00Z"), MTL); // Jan 1 00:30 EST
  assert.equal(r.month, "2027-01");
  assert.deepEqual(r.months, ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
  assert.equal(iso(r.sixMonthsAgo), "2026-08-01T04:00:00.000Z");
  assert.equal(iso(r.startOfMonth), "2027-01-01T05:00:00.000Z");
  assert.equal(iso(r.startOfLastMonth), "2026-12-01T05:00:00.000Z");
});

test("zones east of UTC flip the day earlier (Asia/Tokyo, UTC+9)", () => {
  const r = getDashboardRanges(new Date("2026-10-07T20:00:00Z"), "Asia/Tokyo"); // Oct 8 05:00 JST
  assert.equal(r.today, "2026-10-08");
  assert.equal(iso(r.startOfDay), "2026-10-07T15:00:00.000Z");
  assert.equal(iso(r.endOfDay), "2026-10-08T15:00:00.000Z");
});

test("ranges and displayed hours do not depend on the process time zone", () => {
  const original = process.env.TZ;
  const now = new Date("2026-10-08T03:30:00Z");
  const appointment = new Date("2026-10-08T12:00:00Z"); // 08:00 in Montreal
  const results: string[] = [];
  try {
    for (const tz of ["UTC", "America/Montreal", "Asia/Tokyo", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      const r = getDashboardRanges(now, MTL);
      const hour = appointment.toLocaleTimeString("fr-CA", { hour: "numeric", minute: "2-digit", timeZone: MTL });
      assert.match(hour, /^8\D+00$/, `hour under TZ=${tz}: ${hour}`);
      results.push(JSON.stringify([r.today, r.month, iso(r.startOfDay), iso(r.endOfDay), iso(r.startOfMonth), iso(r.sixMonthsAgo)]));
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
  assert.equal(new Set(results).size, 1);
});
