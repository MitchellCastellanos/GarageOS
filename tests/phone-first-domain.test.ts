// Phone-first calling: pure rules (docs/phone-first-calling-policy.md). Telephone eligibility is independent of email/CASL; email-only behaviour is unchanged by default.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCanadianPhone, pickBestCanadianPhone } from "../src/domain/sales-crm/phone";
import { callingWindow, DEFAULT_HELD_PROVINCES, evaluatePhoneEligibility, timezoneForProvince, type PhoneFacts } from "../src/domain/sales-crm/phone-eligibility";
import { screenCandidate, type ScreenFacts } from "../src/domain/lead-radar/commercial-screen";

const facts = (o: Partial<PhoneFacts> = {}): PhoneFacts => ({
  status: "ACTIVE", merged: false, doNotContact: false, territoryState: "NATIONAL", repairFit: "VERIFIED_REPAIR", province: "ON", phone: "(416) 555-0142", businessBasis: "LISTED_BUSINESS_SOURCE",
  numberSuppressed: false, businessSuppressed: false, sharedWithOlderRecord: false, heldProvinces: DEFAULT_HELD_PROVINCES, ...o,
});

test("normalization: formats are parsed but the fictional 555-01xx range is rejected", () => {
  for (const raw of ["(416) 555-0142", "416-555-0142", "+1 416 555 0142", "1-416-555-0142", "4165550142", "416.555.0142 ext 12", "(418) 555-0199 x4"]) {
    const p = normalizeCanadianPhone(raw);
    // 555-01xx is the fictional range: it must be rejected even though the format is fine
    assert.equal(p, null, raw);
  }
  for (const raw of ["(416) 234-5678", "+1 604 987 6543", "1-418-523-9911", "514.272.1000 poste 21", "(902) 466-4401"]) {
    const p = normalizeCanadianPhone(raw)!;
    assert.ok(p, raw);
    assert.equal(p.kind, "GEOGRAPHIC");
    assert.match(p.e164, /^\+1[2-9]\d{2}[2-9]\d{6}$/);
  }
  assert.equal(normalizeCanadianPhone("1 (800) 267-8001")?.kind, "TOLL_FREE");
});

test("normalization rejects foreign, malformed and placeholder numbers", () => {
  for (const raw of [null, undefined, "", "abc", "12345", "212-555-1234" /* NYC */, "305-234-5678" /* Miami */, "416-111-2345" /* NXX starts 1 */, "011-234-5678", "416-911-2345" /* N11 NXX */, "000-000-0000", "999-999-9999", "+44 20 7946 0958", "416 234 567", "+1 416 234 56789", "1111111111"]) {
    assert.equal(normalizeCanadianPhone(raw as string | null), null, String(raw));
  }
});

test("pickBestCanadianPhone keeps a good later number instead of the first syntactic one; geographic beats toll-free", () => {
  assert.equal(pickBestCanadianPhone(["212-234-5678", "(613) 234-5678"])?.phone.e164, "+16132345678");
  assert.equal(pickBestCanadianPhone(["1-800-267-8001", "613-234-5678"])?.phone.kind, "GEOGRAPHIC");
  assert.equal(pickBestCanadianPhone(["1-800-267-8001"])?.phone.kind, "TOLL_FREE");
  assert.equal(pickBestCanadianPhone([]), null);
});

test("CALLABLE needs only: verified repair shop, REMOTE, valid number, business source, no DNC, province not held — no email, website, landline or paid lookup", () => {
  const e = evaluatePhoneEligibility(facts({ phone: "(416) 234-5678" }));
  assert.equal(e.status, "CALLABLE");
  assert.deepEqual(e.reasons, []);
  // A published MOBILE number from a business listing is callable: line type is not a criterion.
  assert.equal(evaluatePhoneEligibility(facts({ phone: "(514) 234-5678", province: "QC" })).status, "CALLABLE");
  assert.equal(evaluatePhoneEligibility(facts({ phone: "1-800-267-8001" })).status, "CALLABLE");
});

test("email/CASL is not an input: the facts type has no email field and the decision is the same for every email state", () => {
  const f = facts({ phone: "(416) 234-5678" });
  assert.ok(!("email" in f));
  assert.equal(evaluatePhoneEligibility(f).status, "CALLABLE");
});

test("EXCLUDED: DNC, suppression (number and business), archived/merged, FIELD or unresolved territory, excluded fit, no/invalid phone", () => {
  const cases: [Partial<PhoneFacts>, string][] = [
    [{ doNotContact: true }, "DO_NOT_CONTACT"], [{ businessSuppressed: true }, "BUSINESS_SUPPRESSED"], [{ numberSuppressed: true }, "PHONE_SUPPRESSED"],
    [{ status: "ARCHIVED" }, "ARCHIVED_OR_MERGED"], [{ merged: true }, "ARCHIVED_OR_MERGED"], [{ territoryState: "LOCAL" }, "TERRITORY_FIELD"],
    [{ territoryState: "UNRESOLVED" }, "TERRITORY_UNRESOLVED"], [{ territoryState: null }, "TERRITORY_UNRESOLVED"], [{ repairFit: "EXCLUDED" }, "FIT_EXCLUDED"],
    [{ phone: null }, "NO_PHONE"], [{ phone: "  " }, "NO_PHONE"], [{ phone: "212-234-5678" }, "INVALID_PHONE"],
  ];
  for (const [o, reason] of cases) {
    const e = evaluatePhoneEligibility(facts({ phone: "(416) 234-5678", ...o }));
    assert.equal(e.status, "EXCLUDED", reason);
    assert.ok(e.reasons.includes(reason as never), `${reason} in ${e.reasons}`);
  }
  assert.equal(evaluatePhoneEligibility(facts({ phone: "(416) 234-5678", territoryState: "LOCAL" })).dimensions.territory, "EXCLUDED");
  assert.equal(evaluatePhoneEligibility(facts({ phone: "(416) 234-5678", doNotContact: true })).dimensions.legal, "BLOCKED");
});

test("NEEDS_CLASSIFICATION (never counted callable, never discarded): unverified fit, unknown business nature, sole proprietor, shared number", () => {
  const base = { phone: "(416) 234-5678" };
  assert.deepEqual(evaluatePhoneEligibility(facts({ ...base, repairFit: "HUMAN_REVIEW" })).reasons, ["FIT_NOT_VERIFIED"]);
  assert.deepEqual(evaluatePhoneEligibility(facts({ ...base, repairFit: null })).reasons, ["FIT_NOT_VERIFIED"]);
  assert.deepEqual(evaluatePhoneEligibility(facts({ ...base, businessBasis: "UNKNOWN" })).reasons, ["BUSINESS_NATURE_UNKNOWN"]);
  assert.deepEqual(evaluatePhoneEligibility(facts({ ...base, businessBasis: "SOLE_PROPRIETOR_SUSPECTED" })).reasons, ["SOLE_PROPRIETOR_SUSPECTED"]);
  assert.deepEqual(evaluatePhoneEligibility(facts({ ...base, sharedWithOlderRecord: true })).reasons, ["SHARED_NUMBER_DUPLICATE"]);
  for (const o of [{ repairFit: "HUMAN_REVIEW" as const }, { businessBasis: "UNKNOWN" as const }, { sharedWithOlderRecord: true }]) assert.equal(evaluatePhoneEligibility(facts({ ...base, ...o })).status, "NEEDS_CLASSIFICATION");
  // An operator confirmation resolves unknown nature.
  assert.equal(evaluatePhoneEligibility(facts({ ...base, businessBasis: "OPERATOR_VERIFIED" })).status, "CALLABLE");
});

test("provincial hold isolates one province only (BC, MB by default); the rest of the country is unaffected", () => {
  const base = { phone: "(604) 234-5678" };
  const bc = evaluatePhoneEligibility(facts({ ...base, province: "BC" }));
  assert.equal(bc.status, "HELD_PROVINCE");
  assert.deepEqual(bc.reasons, ["PROVINCE_LEGAL_HOLD"]);
  assert.equal(evaluatePhoneEligibility(facts({ ...base, province: "MB" })).status, "HELD_PROVINCE");
  assert.equal(evaluatePhoneEligibility(facts({ ...base, province: "AB" })).status, "CALLABLE");
  assert.equal(evaluatePhoneEligibility(facts({ ...base, province: "BC", heldProvinces: new Set() })).status, "CALLABLE");
  assert.equal(evaluatePhoneEligibility(facts({ ...base, province: null })).status, "HELD_PROVINCE");
  // exclusion beats hold
  assert.equal(evaluatePhoneEligibility(facts({ ...base, province: "BC", doNotContact: true })).status, "EXCLUDED");
});

test("evaluation is deterministic and idempotent", () => {
  const f = facts({ phone: "(416) 234-5678", repairFit: "HUMAN_REVIEW", sharedWithOlderRecord: true });
  assert.deepEqual(evaluatePhoneEligibility(f), evaluatePhoneEligibility({ ...f }));
});

test("calling window follows the RECIPIENT's local time: weekdays 09:00–21:30, weekends 10:00–18:00", () => {
  // Wed 2026-10-21 14:00 UTC = 10:00 Toronto (EDT), 07:00 Vancouver (PDT), 11:30 St. John's (NDT)
  const wed = new Date("2026-10-21T14:00:00Z");
  assert.equal(callingWindow("ON", wed).open, true);
  assert.equal(callingWindow("BC", wed).open, false);
  assert.equal(callingWindow("BC", wed).reason, "BEFORE_OPEN");
  assert.equal(callingWindow("NL", wed).localTime, "11:30");
  // 01:30 UTC Thu = 21:30 Toronto: closed exactly at the end; 21:29 open
  assert.equal(callingWindow("ON", new Date("2026-10-22T01:30:00Z")).open, false);
  assert.equal(callingWindow("ON", new Date("2026-10-22T01:29:00Z")).open, true);
  assert.equal(callingWindow("ON", new Date("2026-10-22T01:30:00Z")).reason, "AFTER_CLOSE");
  // Saturday 2026-10-24: 13:00 UTC = 09:00 Toronto → closed (weekend opens 10:00); 14:00 UTC open; 22:00 UTC = 18:00 closed
  assert.equal(callingWindow("ON", new Date("2026-10-24T13:00:00Z")).open, false);
  assert.equal(callingWindow("ON", new Date("2026-10-24T14:00:00Z")).open, true);
  assert.equal(callingWindow("ON", new Date("2026-10-24T22:00:00Z")).open, false);
  assert.equal(callingWindow("XX", wed).reason, "UNKNOWN_ZONE");
  assert.equal(timezoneForProvince("sk"), "America/Regina");
});

test("DST: the window tracks local time across the autumn change", () => {
  // Nov 1 2026 is the DST end in Toronto. Mon 2026-11-02 14:30 UTC = 09:30 EST → open; 13:30 UTC = 08:30 EST → closed.
  assert.equal(callingWindow("ON", new Date("2026-11-02T14:30:00Z")).open, true);
  assert.equal(callingWindow("ON", new Date("2026-11-02T13:30:00Z")).open, false);
});

// ── Screen: opt-in phone-first, default unchanged ──
const sf = (o: Partial<ScreenFacts> = {}): ScreenFacts => ({ licenseOk: true, tier: "PRIMARY", fit: "VERIFIED_REPAIR", territory: "NATIONAL", address: "1 Main St", city: "Calgary", postalCode: "T2P 1A1", phone: "(403) 234-5678", email: null, ...o });

test("screen: default is unchanged (REMOTE without email rejected); phoneFirst keeps a valid-phone REMOTE shop", () => {
  assert.deepEqual(screenCandidate(sf()).reasons, ["REMOTE_NO_USABLE_EMAIL"]);
  assert.deepEqual(screenCandidate(sf({ phoneFirst: true })), { lane: "REMOTE", reasons: [] });
  assert.deepEqual(screenCandidate(sf({ phoneFirst: true, phone: "212-234-5678" })).reasons, ["REMOTE_NO_USABLE_EMAIL"], "a foreign number is not a callable phone");
  assert.ok((screenCandidate(sf({ phoneFirst: true, phone: null })).reasons as string[]).includes("REMOTE_NO_USABLE_EMAIL"));
  assert.deepEqual(screenCandidate(sf({ email: "info@shop.ca" })), { lane: "REMOTE", reasons: [] });
});

test("screen: phoneFirst changes nothing else — fit, licence, tier, FIELD and unresolved territory rules are identical", () => {
  assert.deepEqual(screenCandidate(sf({ phoneFirst: true, fit: "EXCLUDED" })).reasons, ["FIT_EXCLUDED"]);
  assert.deepEqual(screenCandidate(sf({ phoneFirst: true, fit: "HUMAN_REVIEW" })).reasons, ["FIT_NOT_VERIFIED"]);
  assert.deepEqual(screenCandidate(sf({ phoneFirst: true, licenseOk: false })).reasons, ["LICENSE_BLOCKED"]);
  assert.deepEqual(screenCandidate(sf({ phoneFirst: true, territory: "UNRESOLVED" })).reasons, ["TERRITORY_UNRESOLVED"]);
  assert.equal(screenCandidate(sf({ phoneFirst: true, territory: "LOCAL", email: null })).lane, "FIELD");
  assert.deepEqual(screenCandidate(sf({ phoneFirst: true, operatingStatus: "permanently_closed" })).reasons, ["NOT_OPERATING"]);
});
