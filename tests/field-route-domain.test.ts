import assert from "node:assert/strict";
import test from "node:test";
import {
  COORDINATE_TTL_DAYS, SYNTHETIC_PROVIDER, addressFingerprint, decideLocation, distanceMeters, geocodeQuery, inCanada, syntheticCoordinates, usableLocation, type GeocodeMatch,
} from "../src/domain/sales-crm/geocoding";
import { MAX_ROUTE_STOPS, formatKm, lengthOfOrder, optimizeRoute, pathLengthM, type RoutePoint } from "../src/domain/sales-crm/route-optimizer";
import { navigationUrl, validCoordinate } from "../src/domain/sales-crm/navigation";

const addr = { address: "123 Rue Sainte-Catherine O", city: "Montréal", province: "Quebec", postalCode: "h3b 1a1" };
const now = new Date("2026-10-10T12:00:00Z");

test("geocodeQuery: needs a street and a city or postal code; normalises province/postal", () => {
  assert.equal(geocodeQuery(addr), "123 Rue Sainte-Catherine O, Montréal, QC, H3B 1A1, Canada");
  assert.equal(geocodeQuery({ address: "123 Main" }), null);
  assert.equal(geocodeQuery({ city: "Laval" }), null);
  assert.equal(geocodeQuery({ address: "  ", city: "Laval" }), null);
  assert.ok(geocodeQuery({ address: "1 Main", postalCode: "H7N5X5" }));
});

test("addressFingerprint: stable under formatting, changes with the address", () => {
  const f = addressFingerprint(addr);
  assert.equal(f, addressFingerprint({ ...addr, address: "123  rue sainte-catherine o.", postalCode: "H3B1A1", province: "QC", city: "MONTREAL" }));
  assert.notEqual(f, addressFingerprint({ ...addr, address: "125 Rue Sainte-Catherine O" }));
  assert.notEqual(f, addressFingerprint({ ...addr, postalCode: "H3B 1A2" }));
  assert.notEqual(f, addressFingerprint({ ...addr, city: "Laval" }));
});

const m = (over: Partial<GeocodeMatch> = {}): GeocodeMatch => ({ lat: 45.5, lng: -73.57, accuracy: "ROOFTOP", confidence: 0.95, ...over });
test("decideLocation never fabricates: errors, not-found, ambiguity, low confidence, coarse accuracy and foreign points yield no coordinates", () => {
  assert.deepEqual(decideLocation({ kind: "OK", matches: [m()] }), { status: "GEOCODED", lat: 45.5, lng: -73.57, accuracy: "ROOFTOP", confidence: 0.95 });
  assert.deepEqual(decideLocation({ kind: "NOT_FOUND" }), { status: "INVALID", failureCode: "NOT_FOUND" });
  assert.deepEqual(decideLocation({ kind: "OK", matches: [] }), { status: "INVALID", failureCode: "NOT_FOUND" });
  assert.deepEqual(decideLocation({ kind: "ERROR", code: "RATE_LIMITED" }), { status: "ERROR", failureCode: "RATE_LIMITED" });
  assert.deepEqual(decideLocation({ kind: "OK", matches: [m(), m({ lat: 45.7, lng: -73.4, confidence: 0.92 })] }), { status: "AMBIGUOUS", failureCode: "MULTIPLE_MATCHES" });
  assert.deepEqual(decideLocation({ kind: "OK", matches: [m({ confidence: 0.4 })] }), { status: "AMBIGUOUS", failureCode: "LOW_CONFIDENCE" });
  assert.deepEqual(decideLocation({ kind: "OK", matches: [m({ accuracy: "CITY" })] }), { status: "AMBIGUOUS", failureCode: "COARSE_ACCURACY" });
  assert.deepEqual(decideLocation({ kind: "OK", matches: [m({ lat: 48.85, lng: 2.35 })] }), { status: "INVALID", failureCode: "OUTSIDE_CANADA" });
  assert.equal(decideLocation({ kind: "OK", matches: [m(), m({ lat: 45.7, lng: -73.4, confidence: 0.3 })] }).status, "GEOCODED", "a weak rival does not make it ambiguous");
  assert.equal(inCanada(Number.NaN, -73), false);
});

test("usableLocation: current address, freshness, status and the synthetic provider in production", () => {
  const fp = addressFingerprint(addr);
  const row = { status: "GEOCODED", latitude: 45.5, longitude: -73.57, addressFingerprint: fp, geocodedAt: new Date("2026-09-01T00:00:00Z"), provider: "live" };
  assert.deepEqual(usableLocation(row, addr, now), { usable: true, lat: 45.5, lng: -73.57 });
  assert.deepEqual(usableLocation(row, { ...addr, address: "999 Other St" }, now), { usable: false, reason: "ADDRESS_CHANGED" });
  assert.deepEqual(usableLocation(null, addr, now), { usable: false, reason: "NONE" });
  assert.deepEqual(usableLocation(row, { city: "Laval" }, now), { usable: false, reason: "MISSING_ADDRESS" });
  assert.deepEqual(usableLocation({ ...row, geocodedAt: new Date(now.getTime() - (COORDINATE_TTL_DAYS + 1) * 86_400_000) }, addr, now), { usable: false, reason: "STALE" });
  assert.equal(usableLocation({ ...row, status: "VERIFIED", geocodedAt: new Date(0) }, addr, now).usable, true, "human-verified positions do not expire");
  assert.deepEqual(usableLocation({ ...row, status: "AMBIGUOUS", latitude: null, longitude: null }, addr, now), { usable: false, reason: "AMBIGUOUS" });
  assert.deepEqual(usableLocation({ ...row, provider: SYNTHETIC_PROVIDER }, addr, now, { production: true }), { usable: false, reason: "SYNTHETIC_IN_PRODUCTION" });
  assert.equal(usableLocation({ ...row, provider: SYNTHETIC_PROVIDER }, addr, now, { production: false }).usable, true);
});

test("syntheticCoordinates are deterministic and inside the Montréal test area", () => {
  const a = syntheticCoordinates(addressFingerprint(addr));
  assert.deepEqual(a, syntheticCoordinates(addressFingerprint(addr)));
  assert.ok(inCanada(a.lat, a.lng) && a.lat > 45.3 && a.lat < 45.8 && a.lng > -74.1 && a.lng < -73.4);
});

test("distanceMeters is a haversine great-circle distance", () => {
  const mtl = { lat: 45.5017, lng: -73.5673 }, qc = { lat: 46.8139, lng: -71.2080 };
  assert.ok(Math.abs(distanceMeters(mtl, qc) - 233_000) < 4_000);
  assert.equal(distanceMeters(mtl, mtl), 0);
});

const grid = (n: number): RoutePoint[] => Array.from({ length: n }, (_, i) => ({ id: `s${String(i).padStart(2, "0")}`, lat: 45.4 + ((i * 37) % 11) * 0.01, lng: -73.7 + ((i * 53) % 13) * 0.012 }));
test("optimizeRoute: deterministic regardless of input order, visits every stop once, never longer than nearest-neighbour input order", () => {
  const pts = grid(20);
  const a = optimizeRoute(pts), b = optimizeRoute([...pts].reverse()), c = optimizeRoute([...pts].sort(() => 0.5 - Math.sin(pts.length)));
  assert.deepEqual(a, b); assert.deepEqual(a, c);
  assert.deepEqual([...a.order].sort(), pts.map((p) => p.id).sort());
  assert.ok(a.distanceM <= lengthOfOrder(pts, pts.map((p) => p.id)), "optimized ≤ naive given order");
  assert.equal(a.distanceM, lengthOfOrder(pts, a.order));
  assert.deepEqual(optimizeRoute(pts), a, "repeatable");
});

test("optimizeRoute: 2-opt untangles a crossing, a pinned start is honoured, edge cases", () => {
  // corners of a square given in a crossing order: optimal open path is 3 sides
  const sq: RoutePoint[] = [{ id: "a", lat: 45.5, lng: -73.6 }, { id: "b", lat: 45.6, lng: -73.5 }, { id: "c", lat: 45.5, lng: -73.5 }, { id: "d", lat: 45.6, lng: -73.6 }];
  const r = optimizeRoute(sq, "a");
  assert.equal(r.order[0], "a");
  assert.ok(r.distanceM < pathLengthM([sq[0], sq[1], sq[2], sq[3]]), "better than the crossing order a-b-c-d");
  assert.deepEqual(optimizeRoute([]), { order: [], distanceM: 0 });
  assert.deepEqual(optimizeRoute([sq[0]]), { order: ["a"], distanceM: 0 });
  assert.throws(() => optimizeRoute(grid(MAX_ROUTE_STOPS + 1)), RangeError);
  assert.equal(optimizeRoute(grid(MAX_ROUTE_STOPS)).order.length, MAX_ROUTE_STOPS);
  assert.throws(() => optimizeRoute([sq[0], sq[0]]), RangeError);
  assert.equal(formatKm(420), "420 m"); assert.equal(formatKm(3_540), "3.5 km"); assert.equal(formatKm(23_400), "23 km");
});

test("navigation links: one destination, coordinates only, valid https, bad input refused", () => {
  assert.equal(navigationUrl("google", 45.5017, -73.5673), "https://www.google.com/maps/dir/?api=1&destination=45.501700%2C-73.567300&travelmode=driving");
  assert.equal(navigationUrl("apple", 45.5, -73.5), "https://maps.apple.com/?daddr=45.500000%2C-73.500000&dirflg=d");
  assert.equal(navigationUrl("waze", 45.5, -73.5), "https://www.waze.com/ul?ll=45.500000%2C-73.500000&navigate=yes");
  for (const [la, ln] of [[91, 0], [0, 181], [Number.NaN, 1], [Infinity, 1]] as const) assert.equal(navigationUrl("google", la, ln), null);
  assert.equal(navigationUrl("evil" as never, 1, 1), null);
  assert.equal(validCoordinate("45" as never, "x" as never), false);
});
