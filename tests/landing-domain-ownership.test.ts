import test from "node:test";
import assert from "node:assert/strict";
import { getLandingDnsInstructions, landingChallengeName, landingOwnershipToken, checkLandingDnsRecord } from "../src/lib/domains/landing";
import { RATE_LIMITS } from "../src/lib/rate-limit";

test("landing domain ownership token is per shop+domain, secret-bound, and fails closed without a secret", async () => {
  const prevA = process.env.AUTH_SECRET, prevN = process.env.NEXTAUTH_SECRET;
  process.env.AUTH_SECRET = "s".repeat(32);
  try {
    const a = landingOwnershipToken("shopA", "citas.x.com");
    assert.ok(a && a.startsWith("garageos-verify="));
    assert.equal(a, landingOwnershipToken("shopA", "CITAS.x.com"), "case-insensitive domain");
    assert.notEqual(a, landingOwnershipToken("shopB", "citas.x.com"), "another shop cannot reuse it");
    assert.notEqual(a, landingOwnershipToken("shopA", "otro.x.com"));
    const rows = getLandingDnsInstructions("citas.x.com", "shopA");
    assert.ok(rows.some((r) => r.type === "TXT" && r.name === landingChallengeName("citas.x.com") && r.value === a));
    delete process.env.AUTH_SECRET; delete process.env.NEXTAUTH_SECRET;
    assert.equal(landingOwnershipToken("shopA", "citas.x.com"), null);
    assert.equal(await checkLandingDnsRecord("citas.x.com", "shopA"), false);
  } finally {
    if (prevA === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = prevA;
    if (prevN === undefined) delete process.env.NEXTAUTH_SECRET; else process.env.NEXTAUTH_SECRET = prevN;
  }
});

test("public booking has per-recipient limits (not only per IP)", () => {
  const r = RATE_LIMITS.bookingSubmitContact("shop1", "5145550000");
  assert.equal(r.limit, 3);
  assert.notEqual(r.key, RATE_LIMITS.bookingSubmitContact("shop2", "5145550000").key);
  assert.equal(RATE_LIMITS.bookingContactEmail("shop1", "A@B.com").key, RATE_LIMITS.bookingContactEmail("shop1", "a@b.com").key);
});
