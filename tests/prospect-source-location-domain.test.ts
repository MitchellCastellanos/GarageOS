// Source-coordinate propagation rules (pure): plausibility, address binding, trust ordering, idempotence, coverage buckets.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { toCandidate } from "../src/domain/lead-radar/record";
import { addressFingerprint } from "../src/domain/sales-crm/geocoding";
import { cityKey } from "../src/domain/sales-crm/territory";
import {
  OVERTURE_LOCATION_PROVIDER, checkSourceCoordinates, decideSourceLocation, locationCoverage, locationTrust, type SourceLocationInput,
} from "../src/domain/sales-crm/source-location";

const NOW = new Date("2026-10-17T12:00:00Z");
const ADDR = { address: "123 Rue Sainte-Catherine", city: "Montréal", province: "QC", postalCode: "H2X 1Y4" };
const PT = { lat: 45.5088, lng: -73.5617 };
const row = (o: Partial<{ status: string; provider: string; lat: number | null; lng: number | null; fp: string; geocodedAt: Date | null; attempts: number }> = {}) => ({
  status: o.status ?? "GEOCODED", provider: o.provider ?? "mapbox-permanent-v6", latitude: o.lat === undefined ? 45.5 : o.lat, longitude: o.lng === undefined ? -73.5 : o.lng,
  addressFingerprint: o.fp ?? addressFingerprint(ADDR), geocodedAt: o.geocodedAt === undefined ? NOW : o.geocodedAt, attempts: o.attempts ?? 1,
});
const decide = (o: Partial<SourceLocationInput> = {}) => decideSourceLocation({ source: PT, prospect: ADDR, existing: null, now: NOW, production: true, ...o });

test("extractor point → staged candidate: valid points are kept, rounded, and kept OUT of the content fingerprint", () => {
  const base = { v: 1, id: "00000000-0000-4000-8000-000000000001", confidence: 0.9, name: "Garage A", taxonomy: { primary: "automotive_repair", hierarchy: ["vehicle_service"] },
    address: { freeform: ADDR.address, locality: "Montréal", postcode: "H2X 1Y4", region: "QC", country: "CA" }, sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }] };
  const o = { cityKeyOf: cityKey };
  const withPoint = toCandidate({ ...base, geo: { lat: 45.508812345, lng: -73.561712345 } }, { provinces: ["QC"] }, o);
  const without = toCandidate(base, { provinces: ["QC"] }, o);
  assert.ok(withPoint.ok && without.ok);
  if (withPoint.ok && without.ok) {
    assert.deepEqual([withPoint.candidate.sourceLatitude, withPoint.candidate.sourceLongitude], [45.5088123, -73.5617123]);
    assert.deepEqual([without.candidate.sourceLatitude, without.candidate.sourceLongitude], [null, null]);
    assert.equal(withPoint.candidate.contentFingerprint, without.candidate.contentFingerprint, "a refreshed point must never re-open an approval");
  }
});

test("extractor point validation: out-of-Canada, out-of-province, partial, non-finite and absent points are dropped (record still stages)", () => {
  const mk = (geo: unknown) => ({ v: 1, id: "00000000-0000-4000-8000-000000000002", name: "Garage B", taxonomy: { primary: "automotive_repair", hierarchy: ["vehicle_service"] },
    address: { freeform: "1 Rue A", locality: "Montréal", postcode: "H2X 1Y4", region: "QC", country: "CA" }, sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }], geo });
  for (const geo of [{ lat: 40.7128, lng: -74.006 } /* New York */, { lat: 43.65, lng: -79.38 } /* Toronto, not QC */, { lat: 45.5, lng: null }, { lat: null, lng: null }, null, undefined, { lat: 0, lng: 0 }, { lat: 95, lng: -73 }]) {
    const r = toCandidate(mk(geo), { provinces: ["QC"] }, { cityKeyOf: cityKey });
    assert.ok(r.ok, JSON.stringify(geo));
    if (r.ok) assert.deepEqual([r.candidate.sourceLatitude, r.candidate.sourceLongitude], [null, null], JSON.stringify(geo));
  }
  assert.equal(toCandidate({ ...mk({ lat: "x", lng: "y" }) }, { provinces: ["QC"] }, { cityKeyOf: cityKey }).ok, false, "non-numeric point is a schema error, never silently trusted");
});

test("checkSourceCoordinates: Canada box, province box, missing", () => {
  assert.deepEqual(checkSourceCoordinates(45.5, -73.5, "QC"), { ok: true });
  assert.deepEqual(checkSourceCoordinates(45.5, -73.5, null), { ok: true }, "unknown province: Canada box only");
  assert.deepEqual(checkSourceCoordinates(45.5, 73.5, "QC"), { ok: false, issue: "OUT_OF_CANADA" }, "sign error");
  assert.deepEqual(checkSourceCoordinates(51.05, -114.07, "QC"), { ok: false, issue: "OUT_OF_PROVINCE" }, "Calgary point on a Québec prospect");
  assert.deepEqual(checkSourceCoordinates(undefined, -73.5, "QC"), { ok: false, issue: "NO_SOURCE_COORDINATES" });
  assert.deepEqual(checkSourceCoordinates(Number.NaN, -73.5, "QC"), { ok: false, issue: "NO_SOURCE_COORDINATES" });
});

test("existing source coordinates are written for a prospect with no position", () => {
  const d = decide();
  assert.equal(d.action, "WRITE");
  if (d.action === "WRITE") assert.deepEqual([d.lat, d.lng, d.fingerprint, d.replaces], [PT.lat, PT.lng, addressFingerprint(ADDR), "NOTHING"]);
});

test("missing coordinates never write", () => {
  assert.deepEqual(decide({ source: { lat: null, lng: null } }), { action: "SKIP", reason: "NO_SOURCE_COORDINATES" });
});

test("incomplete addresses are not located from the source (no street, or no city/postal)", () => {
  assert.deepEqual(decide({ prospect: { ...ADDR, address: null } }), { action: "SKIP", reason: "INSUFFICIENT_ADDRESS" });
  assert.deepEqual(decide({ prospect: { ...ADDR, city: null, postalCode: null } }), { action: "SKIP", reason: "INSUFFICIENT_ADDRESS" });
});

test("out-of-province / out-of-Canada source points are rejected, not stored", () => {
  assert.deepEqual(decide({ source: { lat: 51.05, lng: -114.07 } }), { action: "SKIP", reason: "OUT_OF_PROVINCE" });
  assert.deepEqual(decide({ source: { lat: 40.7, lng: -74 } }), { action: "SKIP", reason: "OUT_OF_CANADA" });
});

test("a candidate linked to a prospect at a DIFFERENT address does not move that prospect", () => {
  assert.deepEqual(decide({ sourceAddress: { ...ADDR, address: "900 Boulevard Saint-Laurent" } }), { action: "SKIP", reason: "ADDRESS_MISMATCH" });
  assert.equal(decide({ sourceAddress: { ...ADDR, address: "123, RUE SAINTE-CATHERINE" } }).action, "WRITE", "same address with different case/punctuation still matches");
});

test("never replaces a higher-confidence position (Mapbox, human-verified) and is idempotent against itself", () => {
  assert.deepEqual(decide({ existing: row() }), { action: "SKIP", reason: "HIGHER_CONFIDENCE_EXISTS" });
  assert.deepEqual(decide({ existing: row({ status: "VERIFIED" }) }), { action: "SKIP", reason: "HIGHER_CONFIDENCE_EXISTS" });
  assert.deepEqual(decide({ existing: row({ provider: OVERTURE_LOCATION_PROVIDER }) }), { action: "SKIP", reason: "ALREADY_LOCATED" });
});

test("replaces only unusable rows: failed/ambiguous answers, a stale address, an expired position, synthetic data in production", () => {
  for (const existing of [
    row({ status: "AMBIGUOUS", lat: null, lng: null, geocodedAt: null }), row({ status: "INVALID", lat: null, lng: null, geocodedAt: null }), row({ status: "ERROR", lat: null, lng: null, geocodedAt: null }),
    row({ fp: "0".repeat(32) }), row({ geocodedAt: new Date("2025-01-01T00:00:00Z") }), row({ provider: "synthetic-test" }),
  ]) {
    const d = decide({ existing });
    assert.equal(d.action, "WRITE", JSON.stringify(existing));
    if (d.action === "WRITE") assert.equal(d.replaces, "UNUSABLE");
  }
});

test("a human-verified position for an OLD address does not block the new address", () => {
  assert.equal(decide({ existing: row({ status: "VERIFIED", fp: "f".repeat(32) }) }).action, "WRITE");
});

test("trust ordering: verified > paid geocoder > source point > everything else", () => {
  const t = (status: string, provider: string) => locationTrust({ status, provider });
  assert.ok(t("VERIFIED", "x") > t("GEOCODED", "mapbox-permanent-v6"));
  assert.ok(t("GEOCODED", "mapbox-permanent-v6") > t("GEOCODED", OVERTURE_LOCATION_PROVIDER));
  assert.ok(t("GEOCODED", OVERTURE_LOCATION_PROVIDER) > t("AMBIGUOUS", OVERTURE_LOCATION_PROVIDER));
});

test("duplicate addresses: the fingerprint is stable across spellings and independent of the coordinates", () => {
  const f = (a: object) => createHash("sha256").update(addressFingerprint(a)).digest("hex");
  assert.equal(f(ADDR), f({ ...ADDR, address: "123, RUE SAINTE-CATHERINE", city: "MONTRÉAL", postalCode: "h2x1y4" }));
  assert.notEqual(f(ADDR), f({ ...ADDR, address: "124 Rue Sainte-Catherine" }));
});

test("coverage buckets: located / pending / ambiguous-failed / insufficient address", () => {
  const c = (address: object, loc: ReturnType<typeof row> | null) => locationCoverage(address, loc, NOW, { production: true });
  assert.equal(c(ADDR, row()), "LOCATED");
  assert.equal(c(ADDR, null), "PENDING");
  assert.equal(c(ADDR, row({ fp: "0".repeat(32) })), "PENDING", "address changed → will be re-located");
  assert.equal(c(ADDR, row({ status: "ERROR", lat: null, lng: null, geocodedAt: null, attempts: 1 })), "PENDING", "retryable provider failure");
  assert.equal(c(ADDR, row({ status: "ERROR", lat: null, lng: null, geocodedAt: null, attempts: 3 })), "AMBIGUOUS_FAILED", "repeated failure");
  assert.equal(c(ADDR, row({ status: "AMBIGUOUS", lat: null, lng: null, geocodedAt: null })), "AMBIGUOUS_FAILED");
  assert.equal(c(ADDR, row({ status: "INVALID", lat: null, lng: null, geocodedAt: null })), "AMBIGUOUS_FAILED");
  assert.equal(c({ ...ADDR, address: "Rue Sans Numero" }, null), "INSUFFICIENT_ADDRESS");
  assert.equal(c({ ...ADDR, address: null }, null), "INSUFFICIENT_ADDRESS");
  assert.equal(c({ ...ADDR, city: null, postalCode: null }, null), "INSUFFICIENT_ADDRESS");
});
