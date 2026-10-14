// Mapbox Geocoding v6 integration — NO network, NO credentials, NO paid calls: fetch is always a local mock.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { capabilitiesFor } from "../src/domain/sales-crm/access";
import { addressFingerprint, decideLocation } from "../src/domain/sales-crm/geocoding";
import { MAPBOX_PROVIDER_KEY, MAX_GEOCODE_ATTEMPTS, classifyForGeocoding, isGeocodableAddress, mapboxForwardParams, mapboxResponseToResult } from "../src/domain/sales-crm/mapbox-geocoding";
import { fieldCopy } from "../src/lib/admin-locale/sales-field";
import "./helpers/action-harness";

const { createMapboxProvider, geocodingStatus, liveGeocoder, maxRequestsHardCap } = await import("../src/lib/sales-crm/geocoder");
const { getMapConfig } = await import("../src/lib/sales-crm/map-config");

const TOKEN = "sk.eyJ1IjoiZmFrZSIsImEiOiJmYWtlZmFrZWZha2UifQ.FAKEFAKEFAKEFAKE";
const ADDR = { address: "1234 Rue Saint-Denis", city: "Montréal", province: "QC", postalCode: "H2X 3K8" };
const feature = (over: Record<string, unknown> = {}, mc: Record<string, unknown> = {}, coord: Record<string, unknown> = {}) => ({
  type: "Feature", geometry: { type: "Point", coordinates: [-73.5616, 45.5149] },
  properties: { feature_type: "address", coordinates: { longitude: -73.5616, latitude: 45.5149, accuracy: "rooftop", ...coord },
    match_code: { address_number: "matched", street: "matched", postcode: "matched", place: "matched", region: "matched", country: "matched", confidence: "exact", ...mc }, ...over },
});
const ok = (features: unknown[]) => mapboxResponseToResult(200, { features }, ADDR);

test("requests always ask for Permanent Geocoding, Canada only, never autocomplete", () => {
  const p = mapboxForwardParams("1234 Rue Saint-Denis, Montréal, QC, Canada");
  assert.equal(p.get("permanent"), "true"); assert.equal(p.get("country"), "ca"); assert.equal(p.get("autocomplete"), "false"); assert.equal(p.get("limit"), "3");
  assert.ok(!p.has("access_token"), "the token is added by the server-side provider only");
});

test("an exact rooftop match becomes coordinates; every doubtful answer becomes manual review", () => {
  assert.equal(decideLocation(ok([feature()])).status, "GEOCODED");
  // wrong civic number → capped confidence → review (never a coordinate)
  assert.deepEqual(decideLocation(ok([feature({}, { address_number: "unmatched", confidence: "high" })])), { status: "AMBIGUOUS", failureCode: "LOW_CONFIDENCE" });
  assert.equal(decideLocation(ok([feature({}, { confidence: "medium" })])).status, "AMBIGUOUS");
  assert.equal(decideLocation(ok([feature({}, { postcode: "unmatched" })])).status, "AMBIGUOUS", "postal code mismatch");
  assert.equal(decideLocation(ok([feature({}, {}, { accuracy: "approximate" })])).status, "AMBIGUOUS", "approximate placement is not navigable");
  assert.equal(decideLocation(ok([feature({ feature_type: "street" }, {}, { accuracy: undefined })])).status, "GEOCODED", "interpolated/street results stay navigable only when every component matched");
  assert.equal(decideLocation(ok([feature(), { ...feature(), geometry: { coordinates: [-73.4, 45.7] }, properties: { ...feature().properties, coordinates: { longitude: -73.4, latitude: 45.7, accuracy: "rooftop" } } }])).status, "AMBIGUOUS", "two distinct confident matches");
  assert.equal(decideLocation(ok([feature({}, {}, { latitude: 48.85, longitude: 2.35 })])).status, "INVALID", "outside Canada");
  assert.deepEqual(decideLocation(ok([])), { status: "INVALID", failureCode: "NOT_FOUND" });
});

test("HTTP failures map safely: auth/rate-limit abort a batch, others are retryable errors", () => {
  assert.deepEqual(mapboxResponseToResult(401, {}, ADDR), { kind: "ERROR", code: "AUTH" });
  assert.deepEqual(mapboxResponseToResult(403, {}, ADDR), { kind: "ERROR", code: "AUTH" });
  assert.deepEqual(mapboxResponseToResult(429, {}, ADDR, 30), { kind: "ERROR", code: "RATE_LIMITED", retryAfterMs: 30_000 });
  assert.deepEqual(mapboxResponseToResult(503, {}, ADDR), { kind: "ERROR", code: "PROVIDER_ERROR" });
  assert.deepEqual(mapboxResponseToResult(200, { nope: 1 }, ADDR), { kind: "ERROR", code: "PROVIDER_ERROR" });
});

test("address-quality gate: incomplete addresses never spend a request", () => {
  assert.equal(isGeocodableAddress(ADDR), true);
  assert.equal(isGeocodableAddress({ address: "Rue Saint-Denis", city: "Montréal" }), false, "no civic number");
  assert.equal(isGeocodableAddress({ address: "1234 Rue Saint-Denis" }), false, "no city or postal code");
  assert.equal(isGeocodableAddress({ city: "Montréal" }), false);
  const now = new Date("2026-10-14T12:00:00Z");
  assert.deepEqual(classifyForGeocoding({ address: "Rue Saint-Denis", city: "Montréal" }, null, now, { production: true }), { kind: "INCOMPLETE", reason: "NO_CIVIC_NUMBER" });
});

test("queue classification is idempotent: located prospects are READY, only new/changed/stale ones cost a request", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const fp = addressFingerprint(ADDR);
  const row = (over: Record<string, unknown> = {}) => ({ status: "GEOCODED", latitude: 45.5, longitude: -73.56, addressFingerprint: fp, geocodedAt: new Date("2026-10-01T00:00:00Z"), provider: MAPBOX_PROVIDER_KEY, attempts: 1, ...over });
  const cls = (loc: ReturnType<typeof row> | null, a = ADDR) => classifyForGeocoding(a, loc, now, { production: true }).kind;
  assert.equal(cls(null), "TO_GEOCODE");
  assert.equal(cls(row()), "READY");
  assert.equal(cls(row(), { ...ADDR, address: "99 Rue Saint-Denis" }), "TO_GEOCODE", "address changed");
  assert.equal(cls(row({ geocodedAt: new Date("2024-01-01T00:00:00Z") })), "TO_GEOCODE", "stale");
  assert.equal(cls(row({ status: "VERIFIED" })), "READY");
  assert.equal(cls(row({ status: "AMBIGUOUS", latitude: null, longitude: null })), "REVIEW");
  assert.equal(cls(row({ status: "INVALID", latitude: null, longitude: null })), "REVIEW");
  assert.equal(cls(row({ status: "ERROR", latitude: null, longitude: null, attempts: 1 })), "ERROR_RETRY");
  assert.equal(cls(row({ status: "ERROR", latitude: null, longitude: null, attempts: MAX_GEOCODE_ATTEMPTS })), "REVIEW");
});

test("provider: sends permanent=true with the server token, never leaks it, and uses only the injected fetch", async () => {
  const calls: string[] = [];
  const fetchMock = (async (url: string) => { calls.push(String(url)); return new Response(JSON.stringify({ features: [feature()] }), { status: 200 }); }) as unknown as typeof fetch;
  const r = await createMapboxProvider(TOKEN, fetchMock).geocode("q", ADDR, new AbortController().signal);
  assert.equal(calls.length, 1);
  const u = new URL(calls[0]);
  assert.equal(u.origin + u.pathname, "https://api.mapbox.com/search/geocode/v6/forward");
  assert.equal(u.searchParams.get("permanent"), "true"); assert.equal(u.searchParams.get("access_token"), TOKEN);
  assert.equal(r.kind, "OK");
  const boom = (async (url: string) => { throw new Error(`network down ${url}`); }) as unknown as typeof fetch;
  const e = await createMapboxProvider(TOKEN, boom).geocode("q", ADDR, new AbortController().signal);
  assert.deepEqual(e, { kind: "ERROR", code: "PROVIDER_ERROR" });
  assert.ok(!JSON.stringify(e).includes("sk."), "errors carry a code only");
  const ctl = new AbortController(); ctl.abort();
  assert.deepEqual(await createMapboxProvider(TOKEN, boom).geocode("q", ADDR, ctl.signal), { kind: "ERROR", code: "TIMEOUT" });
});

test("status: fails safe without credentials, needs the environment switch, never live by accident", () => {
  const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
  assert.deepEqual(geocodingStatus(env({ GEOCODING_PROVIDER: "mapbox" }), true), { mode: "PENDING_CONFIGURATION", live: false, reason: "MISSING_CREDENTIALS" });
  assert.deepEqual(geocodingStatus(env({ GEOCODING_PROVIDER: "mapbox", MAPBOX_GEOCODING_TOKEN: "not-a-token" }), true).reason, "MISSING_CREDENTIALS");
  assert.deepEqual(geocodingStatus(env({ GEOCODING_PROVIDER: "mapbox", MAPBOX_GEOCODING_TOKEN: TOKEN }), true), { mode: "DISABLED", live: false, reason: "DISABLED_BY_ENV" });
  assert.deepEqual(geocodingStatus(env({ GEOCODING_PROVIDER: "mapbox", MAPBOX_GEOCODING_TOKEN: TOKEN, MAPBOX_GEOCODING_ENABLED: "true" }), true), { mode: "LIVE", live: true, reason: "LIVE_ADMIN_ONLY" });
  assert.equal(liveGeocoder(env({}))?.key, undefined, "no provider without configuration");
  assert.equal(liveGeocoder(env({ GEOCODING_PROVIDER: "mapbox", MAPBOX_GEOCODING_TOKEN: TOKEN, MAPBOX_GEOCODING_ENABLED: "true" }))?.key, MAPBOX_PROVIDER_KEY);
  assert.equal(maxRequestsHardCap(env({})), 500); assert.equal(maxRequestsHardCap(env({ GEOCODING_MAX_REQUESTS_HARD_CAP: "150" })), 150); assert.equal(maxRequestsHardCap(env({ GEOCODING_MAX_REQUESTS_HARD_CAP: "x" })), 500);
});

test("the seller-facing locate path can never reach Mapbox (synthetic only)", () => {
  const svc = readFileSync(new URL("../src/lib/sales-crm/location-service.ts", import.meta.url), "utf8");
  assert.ok(svc.includes("activeGeocoder()") && !svc.includes("liveGeocoder"));
  const gc = readFileSync(new URL("../src/lib/sales-crm/geocoder.ts", import.meta.url), "utf8");
  assert.match(gc, /export function activeGeocoder\(\)[^]*?mode === "SYNTHETIC"/);
  const planner = readFileSync(new URL("../src/components/sales-field/RoutePlanner.tsx", import.meta.url), "utf8");
  assert.ok(planner.includes('geocoding.mode === "SYNTHETIC"'), "the seller locate button exists only in synthetic test mode");
});

test("map config: public pk. token only, restricted to a style slug; secret tokens never reach the client", () => {
  const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
  const PK = "pk.eyJ1IjoiZmFrZSIsImEiOiJmYWtlZmFrZWZha2UifQ.FAKEFAKEFAKEFAKE";
  assert.equal(getMapConfig(env({})), null);
  assert.equal(getMapConfig(env({ MAP_PROVIDER: "mapbox" })), null, "no token → list-first");
  assert.equal(getMapConfig(env({ MAP_PROVIDER: "mapbox", MAPBOX_PUBLIC_TOKEN: TOKEN })), null, "sk. token refused");
  assert.equal(getMapConfig(env({ MAP_PROVIDER: "mapbox", MAPBOX_PUBLIC_TOKEN: PK, MAPBOX_MAP_STYLE: "../evil" })), null);
  const cfg = getMapConfig(env({ MAP_PROVIDER: "mapbox", MAPBOX_PUBLIC_TOKEN: PK }))!;
  assert.ok(cfg.rasterTiles![0].startsWith("https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}?access_token=pk."));
  assert.match(cfg.attribution, /Mapbox/); assert.match(cfg.attribution, /OpenStreetMap/);
  assert.deepEqual(getMapConfig(env({ MAP_STYLE_URL: "https://tiles.example.com/s.json", MAP_ATTRIBUTION: "© Example" })), { styleUrl: "https://tiles.example.com/s.json", attribution: "© Example" });
});

test("only Super Admin holds manage_geocoding; every geocoding action is guarded by it", () => {
  for (const kind of ["SALES_REP", "SALES_MANAGER"] as const) for (const mode of ["FIELD", "REMOTE"] as const) assert.equal(capabilitiesFor(kind, mode).has("manage_geocoding"), false, `${kind}/${mode}`);
  assert.equal(capabilitiesFor("SUPER_ADMIN").has("manage_geocoding"), true);
  const src = readFileSync(new URL("../src/actions/sales-geocoding.ts", import.meta.url), "utf8");
  const all = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  const guarded = [...src.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\s*\n\s*const actor = await requireCrmActor\("manage_geocoding"\)/g)].map((m) => m[1]);
  assert.deepEqual(guarded.sort(), all.sort()); assert.ok(all.length >= 2);
  const svc = readFileSync(new URL("../src/lib/sales-crm/geocoding-admin-service.ts", import.meta.url), "utf8");
  assert.ok((svc.match(/requireSuperAdmin\(actor\)/g) ?? []).length >= 3, "service re-checks the actor");
});

test("no secret in source: no token literals and no logging of requests or tokens in the geocoding code", () => {
  for (const f of ["src/lib/sales-crm/geocoder.ts", "src/lib/sales-crm/geocoding-admin-service.ts", "src/domain/sales-crm/mapbox-geocoding.ts", "src/actions/sales-geocoding.ts", "src/lib/sales-crm/map-config.ts"]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.ok(!/\b[sp]k\.eyJ/.test(src), `${f}: token literal`);
    assert.ok(!/console\.(log|error|warn|info)/.test(src), `${f}: logging`);
    assert.ok(!/permanent=false|permanent", "false"/.test(src), `${f}: temporary geocoding must never be requested`);
  }
  // The public bundle only ever receives MapConfig (public pk. token); the geocoding token variable is read server-side only.
  const client = readFileSync(new URL("../src/components/sales-field/GeocodingAdmin.tsx", import.meta.url), "utf8");
  assert.ok(!client.includes("MAPBOX_GEOCODING_TOKEN") && !client.includes("process.env"));
});

test("EN/FR geocoding admin copy is complete in both languages", () => {
  const shape = (v: unknown): unknown => (v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, shape(x)])) : typeof v);
  assert.deepEqual(shape(fieldCopy("en").geocodingAdmin), shape(fieldCopy("fr").geocodingAdmin));
  for (const loc of ["en", "fr"] as const) {
    const c = fieldCopy(loc);
    for (const k of ["GEOCODING_NOT_LIVE", "GEOCODING_DISABLED", "BUDGET_EXHAUSTED", "RUN_IN_PROGRESS", "INVALID_BUDGET"]) assert.ok(c.errors[k], `${loc} ${k}`);
    for (const k of ["LIVE", "MISSING_CREDENTIALS", "DISABLED_BY_ENV", "LIVE_ADMIN_ONLY"]) assert.ok((c.geocoding as Record<string, unknown>)[k], `${loc} ${k}`);
    for (const k of ["AMBIGUOUS", "NOT_FOUND", "ERROR_EXHAUSTED", "ERROR", "NO_STREET", "NO_CIVIC_NUMBER", "NO_CITY_OR_POSTAL"]) assert.ok(c.geocodingAdmin.reasons[k], `${loc} reason ${k}`);
  }
});
