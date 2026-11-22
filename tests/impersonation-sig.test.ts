import test from "node:test";
import assert from "node:assert/strict";
import { isValidImpersonationSig, signImpersonation } from "../src/lib/impersonation-sig";

const base = { shopId: "shop_target", shopName: "Target", startedByUserId: "user_1", startedByName: "Rep", expiresAt: Date.now() + 3_600_000 };

test("impersonation claims: only server-signed claims verify; tampering or missing secret fails closed", () => {
  const prev = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "x".repeat(32);
  try {
    const claim = signImpersonation(base);
    assert.equal(isValidImpersonationSig(claim), true);
    assert.equal(isValidImpersonationSig({ ...base }), false, "unsigned (client-forged) claim");
    assert.equal(isValidImpersonationSig({ ...claim, shopId: "other_shop" }), false, "shopId swapped");
    assert.equal(isValidImpersonationSig({ ...claim, expiresAt: claim.expiresAt + 9e9 }), false, "expiry extended");
    assert.equal(isValidImpersonationSig({ ...claim, salesDemoId: "demo_x" }), false, "demo id added");
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    assert.equal(isValidImpersonationSig(claim), false, "no secret configured");
    assert.throws(() => signImpersonation(base));
  } finally {
    if (prev === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = prev;
  }
});
