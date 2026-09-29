import assert from "node:assert/strict";
import test from "node:test";
import { findPlanSubscriptionItem, getSmsOverageItemPriceId, resolvePlanFromPriceId } from "../src/lib/stripe";

process.env.STRIPE_PRICE_CORE_MONTHLY = "price_core_monthly";
process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_monthly";
process.env.STRIPE_PRICE_COMPLETE_YEARLY = "price_complete_yearly";

test("resolvePlanFromPriceId matches a configured price, null for an unknown one", () => {
  assert.deepEqual(resolvePlanFromPriceId("price_pro_monthly"), { plan: "PRO", interval: "MONTHLY" });
  assert.equal(resolvePlanFromPriceId("price_sms_overage"), null);
});

test("findPlanSubscriptionItem picks the plan item regardless of its position", () => {
  const overageItem = { price: { id: "price_sms_overage" } };
  const planItem = { price: { id: "price_complete_yearly" } };

  // El item de plan primero (orden típico de un checkout nuevo).
  assert.equal(findPlanSubscriptionItem([planItem, overageItem]), planItem);
  // El item de plan después — el caso que rompía con `items.data[0]`.
  assert.equal(findPlanSubscriptionItem([overageItem, planItem]), planItem);
});

test("findPlanSubscriptionItem returns null when no item matches a known plan price", () => {
  const overageItem = { price: { id: "price_sms_overage" } };
  assert.equal(findPlanSubscriptionItem([overageItem]), null);
  assert.equal(findPlanSubscriptionItem([]), null);
});

test("getSmsOverageItemPriceId reads STRIPE_SMS_OVERAGE_PRICE_ID, null when unset/blank", () => {
  delete process.env.STRIPE_SMS_OVERAGE_PRICE_ID;
  assert.equal(getSmsOverageItemPriceId(), null);

  process.env.STRIPE_SMS_OVERAGE_PRICE_ID = "  price_sms_overage  ";
  assert.equal(getSmsOverageItemPriceId(), "price_sms_overage");
  delete process.env.STRIPE_SMS_OVERAGE_PRICE_ID;
});
