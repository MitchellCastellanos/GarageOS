// Explicitly disposable native-PostgreSQL QA. No Production/remote URL accepted.
import "../tests/helpers/action-harness";
import { setSession } from "../tests/helpers/action-harness";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { activationToken, activationHash } from "../src/domain/sales-demo-conversion";
const { activateDemoOwner, claimDemoCheckout, expireSalesDemos } = await import("../src/lib/sales-demo-conversion");
import type { StripeSyncApi } from "../src/lib/stripe-sync";
const { processStripeEvent, confirmCheckoutSession } = await import("../src/lib/stripe-sync");
import { getEffectiveSubscription } from "../src/lib/subscription";
import type Stripe from "stripe";
const { getPlatformGrowth } = await import("../src/actions/platform");

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (process.env.GARAGEOS_WAVE3_LOCAL_QA !== "1" || url.hostname !== "127.0.0.1" || url.port !== "54330" || url.pathname !== "/garageos_wave3_utf8" || process.env.PROVIDER_SIDE_EFFECTS !== "disabled") throw new Error("LOCAL_DISPOSABLE_QA_ONLY");
const identity = await db.$queryRaw<{ database: string; address: string }[]>`SELECT current_database() as database, host(inet_server_addr()) as address`;
assert.deepEqual(identity[0], { database: "garageos_wave3_utf8", address: "127.0.0.1" });
// All Stripe boundaries below are injected or replaced with deterministic fakes.
const suffix = randomUUID().slice(0, 8);
const passwordHash = await bcrypt.hash("Local-QA-password-2026", 12);
const sales = await db.user.create({ data: { name: "Local Sales", email: `sales-${suffix}@example.test`, role: "SUPER_ADMIN", passwordHash, emailVerified: new Date(), preferredLocale: "FR" } });
const future = new Date(Date.now() + 30 * 86400_000);
async function fixture(status: "ACTIVE" | "ACTIVATION_SENT" = "ACTIVATION_SENT", language: "EN" | "FR" = "FR") {
  const token = activationToken();
  const shop = await db.shop.create({ data: { name: `Garage Dupont Montréal — atelier de préparation et entretien ${suffix}`, defaultLanguage: language,
    logoUrl: "/brand/logo-stacked.png", bookingCoverImageUrl: "/brand/logo-stacked.png", bookingShopImageUrl: "/brand/logo-stacked.png", brandColor: "#1265ab", onboardingCompletedAt: new Date(),
    subscription: { create: { status: "AWAITING_PLAN", plan: null, stripeCustomerId: `cus_${randomUUID()}` } } } });
  const demo = await db.salesDemo.create({ data: { shopId: shop.id, createdByUserId: sales.id, status, preferredLanguage: language, currentPlan: "COMPLETE", proposedPlan: "PRO", proposedBillingInterval: "MONTHLY",
    ownerName: "Local Owner", ownerEmail: `owner-${randomUUID()}@example.test`, expiresAt: future, activationTokenHash: activationHash(token), activationExpiresAt: new Date(Date.now() + 86400_000) } });
  return { shop, demo, token };
}
let assertions = 0;
function proven(label: string) { assertions++; console.log(`PASS ${label}`); }
setSession(null);
const a = await fixture();
await db.shop.update({where:{id:a.shop.id},data:{address:"123 Local QA Street",phone:"5145550100",taxId:"LOCAL-QA-TAX",bookingEnabled:true,slug:`local-${suffix}`,bookingSlotMinutes:30,bookingAdvanceDays:45,bookingTemplate:"BOLD",bookingPagePublishedAt:new Date()}});
const preparedService=await db.shopBookingService.create({data:{shopId:a.shop.id,labelFr:"Entretien préparé",labelEn:"Prepared maintenance",labelEs:"Mantenimiento",durationMinutes:45,isFeatured:true}});
const preparedHours=await db.shopWorkingHours.create({data:{shopId:a.shop.id,dayOfWeek:1,openTime:"08:30",closeTime:"17:00"}});
const liveClient = await db.client.create({ data: { shopId: a.shop.id, firstName: "Legitimate prospect", email: "prospect@example.test" } });
const liveVehicle = await db.vehicle.create({ data: { clientId: liveClient.id, make: "Honda", model: "Civic", year: 2020, licensePlate: "LOCALQA" } });
await db.salesDemo.update({ where: { id: a.demo.id }, data: { status: "ACTIVE" } });
setSession({ user: { id: sales.id, role: "OWNER", shopId: a.shop.id }, impersonation: { shopId: a.shop.id, salesDemoId: a.demo.id, shopName: a.shop.name, startedByName: "Sales", startedByUserId: sales.id, expiresAt: future.getTime() } });
const { loadSalesDemoScenario } = await import("../src/actions/sales-demo-experience");
await loadSalesDemoScenario(a.demo.id);
await db.salesDemo.update({ where: { id: a.demo.id }, data: { status: "ACTIVATION_SENT" } });
setSession(null);
const historicalSms = await db.communicationMessage.create({ data: { shopId: a.shop.id, channel: "SMS", status: "SENT", provider: "twilio", from: "local", to: ["local-recipient"], salesDemoOriginId: a.demo.id, segments: 2, billedOverageSegments: 9 } });
const baseline = await db.shop.findUniqueOrThrow({ where: { id: a.shop.id } });
const concurrent = await Promise.allSettled(Array.from({ length: 8 }, () => activateDemoOwner(a.demo.id, a.token, "Local-QA-password-2026")));
assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1); assert.equal(await db.user.count({ where: { shopId: a.shop.id, role: "OWNER" } }), 1); proven("8 concurrent activations produce ONE verified OWNER");
const activated = await db.salesDemo.findUniqueOrThrow({ where: { id: a.demo.id } });
assert.equal(activated.status, "AWAITING_PAYMENT"); assert.equal(activated.activationTokenHash, null); proven("activation consumes hash and moves explicitly to AWAITING_PAYMENT");
await assert.rejects(activateDemoOwner(a.demo.id, a.token, "Local-QA-password-2026")); proven("used-token replay fails closed");
await assert.rejects(activateDemoOwner(a.demo.id, "0".repeat(64), "Local-QA-password-2026")); proven("invalid token fails closed");
const b = await fixture(); await assert.rejects(activateDemoOwner(b.demo.id, a.token, "Local-QA-password-2026")); proven("Shop A token cannot activate Shop B");
await db.salesDemo.update({ where: { id: b.demo.id }, data: { activationExpiresAt: new Date(0) } });
await assert.rejects(activateDemoOwner(b.demo.id, b.token, "Local-QA-password-2026")); proven("expired activation token fails closed");
const expired = await fixture(); await db.salesDemo.update({ where: { id: expired.demo.id }, data: { expiresAt: new Date(0) } }); await expireSalesDemos();
assert.equal((await db.salesDemo.findUniqueOrThrow({ where: { id: expired.demo.id } })).status, "EXPIRED"); await assert.rejects(activateDemoOwner(expired.demo.id, expired.token, "Local-QA-password-2026")); proven("expired demo transitions to EXPIRED and cannot activate");
const collision = await fixture(); await db.salesDemo.update({ where: { id: collision.demo.id }, data: { ownerEmail: sales.email } }); await assert.rejects(activateDemoOwner(collision.demo.id, collision.token, "Local-QA-password-2026")); proven("SUPER_ADMIN identity collision cannot become OWNER");
await db.salesDemo.update({ where: { id: collision.demo.id }, data: { ownerEmail: activated.ownerEmail } }); await assert.rejects(activateDemoOwner(collision.demo.id, collision.token, "Local-QA-password-2026")); proven("existing account in another Shop cannot be reassigned");
const attempts = await Promise.all(Array.from({ length: 8 }, () => claimDemoCheckout(a.demo.id, activated.activatedOwnerId!)));
assert.equal(new Set(attempts.map((d) => d.checkoutAttemptId)).size, 1); proven("8 concurrent Checkout claims share ONE persisted attempt");
// Exercise the real billing action/helper against native rows, with every SDK
// boundary replaced. Browser-submitted terms cannot override Sales' terms.
const { startCheckoutAction } = await import("../src/actions/billing");
const { getStripeClient: fakeClient } = await import("../src/lib/stripe");
process.env.STRIPE_SECRET_KEY = "sk_test_local_fixture"; process.env.STRIPE_TEST_MUTATIONS = "enabled";
process.env.STRIPE_PRICE_PRO_MONTHLY = "price_local_pro_monthly";
process.env.STRIPE_SMS_OVERAGE_PRICE_ID = "";
const sdk = fakeClient(); const savedCreate = sdk.checkout.sessions.create; const savedRetrieve = sdk.checkout.sessions.retrieve; const savedPrice = sdk.prices.retrieve;
const keys = new Set<string>(); const checkout = { id: `cs_mock_${suffix}`, url: "https://checkout.example.test/local", status: "open", client_reference_id: a.shop.id };
sdk.prices.retrieve = (async () => ({ active: true, currency: "cad", unit_amount: 29900, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } })) as unknown as typeof savedPrice;
sdk.checkout.sessions.create = (async (params: Stripe.Checkout.SessionCreateParams, options: Stripe.RequestOptions) => {
  assert.equal(params.line_items?.[0].price, "price_local_pro_monthly"); assert.equal(params.subscription_data?.trial_period_days, 14);
  assert.equal(params.automatic_tax?.enabled, true); assert.equal(params.client_reference_id, a.shop.id);
  assert.ok(params.success_url?.includes("/admin/activation-payment")); keys.add(options.idempotencyKey!); return checkout;
}) as unknown as typeof savedCreate;
sdk.checkout.sessions.retrieve = (async () => checkout) as unknown as typeof savedRetrieve;
setSession({ user: { id: activated.activatedOwnerId!, role: "OWNER", shopId: a.shop.id, email: activated.ownerEmail! } });
try {
  const maliciousTerms = new FormData(); maliciousTerms.set("plan", "COMPLETE"); maliciousTerms.set("interval", "YEARLY"); maliciousTerms.set("returnTo", "billing");
  const starts = await Promise.all(Array.from({ length: 8 }, () => startCheckoutAction(maliciousTerms)));
  assert.ok(starts.every(r => r.url === checkout.url)); assert.equal(keys.size, 1); proven("8 real Checkout actions use ONE stable key and server-selected plan/trial/tax/return path");
  assert.equal((await startCheckoutAction(maliciousTerms)).url, checkout.url); assert.equal(keys.size, 1); proven("persisted open Checkout resumes without creating another commercial path");
} finally { sdk.checkout.sessions.create = savedCreate; sdk.checkout.sessions.retrieve = savedRetrieve; sdk.prices.retrieve = savedPrice; process.env.STRIPE_TEST_MUTATIONS = "disabled"; }
const stripeRow = await db.subscription.findUniqueOrThrow({ where: { shopId: a.shop.id } });
process.env.STRIPE_PRICE_PRO_MONTHLY = "price_local_pro_monthly";
const stripeSub = { id: `sub_${suffix}`, customer: stripeRow.stripeCustomerId!, status: "trialing", metadata: { shopId: a.shop.id }, trial_end: Math.floor(Date.now() / 1000) + 14 * 86400,
  cancel_at_period_end: false, items: { data: [{ id: "si_local", price: { id: "price_local_pro_monthly" }, current_period_end: Math.floor(Date.now() / 1000) + 14 * 86400 }] } } as unknown as Stripe.Subscription;
const api: StripeSyncApi = { retrieveSubscription: async () => stripeSub, cancelSubscription: async () => { throw new Error("unexpected duplicate"); } };
const session = { id: "cs_local", status: "open", client_reference_id: a.shop.id, subscription: stripeSub.id } as unknown as Stripe.Checkout.Session;
assert.equal(await confirmCheckoutSession("cs_local", a.shop.id, api, async () => session), "incomplete"); assert.equal((await db.salesDemo.findUniqueOrThrow({ where: { id: a.demo.id } })).status, "AWAITING_PAYMENT"); proven("redirect/open Checkout cannot convert");
assert.equal(await confirmCheckoutSession("cs_local", b.shop.id, api, async () => session), "forbidden"); proven("Checkout Shop binding rejects another tenant");
setSession({ user: { id: sales.id, shopId: null, role: "SUPER_ADMIN" } }); const before = await getPlatformGrowth();
await db.subscription.update({ where: { shopId: b.shop.id }, data: { plan: "COMPLETE", status: "ACTIVE" } });
const excluded = await getPlatformGrowth(); assert.deepEqual(excluded, before); proven("unconverted demo ACTIVE subscription cannot inflate customer/MRR/cohort/status/churn metrics");
const event = { id: `evt_${suffix}`, type: "customer.subscription.updated", data: { object: { ...stripeSub, status: "past_due" } } } as Stripe.Event;
assert.equal(await processStripeEvent(event, api), "processed"); assert.equal(await processStripeEvent(event, api), "duplicate");
assert.equal((await db.salesDemo.findUniqueOrThrow({ where: { id: a.demo.id } })).status, "CONVERTED"); proven("fresh Stripe TRIALING evidence converts; duplicate/stale webhook converges");
assert.equal(await confirmCheckoutSession("cs_local", a.shop.id, api, async () => ({ ...session, status: "complete" })), "confirmed"); proven("webhook then browser confirmation is idempotent");
const after = await getPlatformGrowth(); assert.equal(after.totalShops, before.totalShops + 1); assert.equal(after.byStatus.TRIALING, (before.byStatus.TRIALING ?? 0) + 1); assert.equal(after.mrr, before.mrr); assert.equal(after.newShops30d, before.newShops30d + 1); assert.equal(after.cohorts.reduce((n,c)=>n+c.count,0), before.cohorts.reduce((n,c)=>n+c.count,0) + 1); assert.equal(after.cancellationsAll,before.cancellationsAll); proven("conversion enters customer/cohort metrics exactly once; trial is not MRR");
const retained = await db.shop.findUniqueOrThrow({ where: { id: a.shop.id } });
for (const field of Object.keys(baseline) as (keyof typeof baseline)[]) if (field !== "onboardingCompletedAt") assert.deepEqual(retained[field], baseline[field], field); assert.deepEqual(await db.shopBookingService.findUnique({where:{id:preparedService.id}}),preparedService); assert.deepEqual(await db.shopWorkingHours.findUnique({where:{id:preparedHours.id}}),preparedHours); proven("same Shop ID and ALL preparation/configuration fields, services and hours preserved");
assert.ok(await db.client.findUnique({ where: { id: liveClient.id } })); assert.ok(await db.vehicle.findUnique({ where: { id: liveVehicle.id } }));
const retainedDemo = await db.salesDemo.findUniqueOrThrow({ where: { id: a.demo.id } }); assert.ok(retainedDemo.scenarioBatchId);
assert.equal(await db.invoice.count({ where: { shopId: a.shop.id, demoSeedBatchId: retainedDemo.scenarioBatchId } }), 1); proven("legitimate records and explicitly retained marked scenario survive conversion");
const owner = await db.user.findUniqueOrThrow({ where: { id: activated.activatedOwnerId! } });
setSession({ user: { id: owner.id, shopId: a.shop.id, role: "OWNER" } }); const effective = await getEffectiveSubscription(a.shop.id); assert.equal(effective.plan, "PRO"); assert.equal(effective.salesDemoId, undefined); assert.equal(effective.hasStripeSubscription, true); proven("normal paid/trial entitlement is sole owner authority after conversion");
setSession({ user: { id: sales.id, role: "OWNER", shopId: a.shop.id }, impersonation: { shopId: a.shop.id, salesDemoId: a.demo.id, shopName: a.shop.name, startedByName: "Sales", startedByUserId: sales.id, expiresAt: future.getTime() } });
assert.equal((await getEffectiveSubscription(a.shop.id)).salesDemoId, undefined); proven("Sales demo override never returns after conversion");
const missingEvent = `evt_crashed_${suffix}`;
await db.stripeWebhookEvent.create({ data: { id: missingEvent, type: "ignored", completedAt: null, processedAt: new Date(Date.now() - 10 * 60_000) } });
assert.equal(await processStripeEvent({ id: missingEvent, type: "ignored" } as unknown as Stripe.Event, api), "processed"); proven("crashed webhook lease is reclaimable");
const freshEvent = `evt_inflight_${suffix}`; await db.stripeWebhookEvent.create({ data: { id: freshEvent, type: "ignored", completedAt: null } });
await assert.rejects(processStripeEvent({ id: freshEvent, type: "ignored" } as unknown as Stripe.Event, api), /STRIPE_EVENT_IN_PROGRESS/); proven("unfinished concurrent webhook is retried, never acknowledged as complete");
await db.salesDemo.delete({ where: { id: a.demo.id } }); assert.ok(await db.shop.findUnique({ where: { id: a.shop.id } })); proven("deleting SalesDemo does not cascade-delete real Shop");
const { getStripeClient, reportSmsOverageUsage } = await import("../src/lib/stripe");
process.env.STRIPE_SECRET_KEY = "sk_test_local_fixture"; process.env.STRIPE_TEST_MUTATIONS = "enabled"; process.env.STRIPE_SMS_OVERAGE_METER_EVENT_NAME = "local_sms";
const stripe = getStripeClient(); const originalMeter = stripe.billing.meterEvents.create;
let metered = 0;
stripe.billing.meterEvents.create = (async () => { metered++; return {}; }) as unknown as typeof originalMeter;
try {
  assert.equal(await reportSmsOverageUsage({ stripeCustomerId: stripeRow.stripeCustomerId!, segments: 9, messageId: historicalSms.id }), false);
  assert.equal(metered, 0); proven("historical demo SMS cannot meter after conversion AND SalesDemo deletion");
  const paidSms = await db.communicationMessage.create({ data: { shopId: a.shop.id, channel: "SMS", status: "SENT", provider: "twilio", from: "local", to: ["local-recipient"], segments: 2, billedOverageSegments: 9 } });
  assert.equal(await reportSmsOverageUsage({ stripeCustomerId: stripeRow.stripeCustomerId!, segments: 9, messageId: paidSms.id }), true);
  assert.equal(metered, 1); proven("post-conversion paid SMS reaches normal mocked Stripe metering");
} finally { stripe.billing.meterEvents.create = originalMeter; process.env.STRIPE_TEST_MUTATIONS = "disabled"; }

// Browser-first confirmation and a Complete-demo to Core purchase use exactly
// the same finalizer. Commercial entitlement must win over the old demo tier.
const core = await fixture(); await db.salesDemo.update({where:{id:core.demo.id},data:{proposedPlan:"CORE"}});
setSession(null); await activateDemoOwner(core.demo.id,core.token,"Local-QA-password-2026");
const coreRow=await db.subscription.findUniqueOrThrow({where:{shopId:core.shop.id}});
process.env.STRIPE_PRICE_CORE_MONTHLY="price_local_core_monthly";
const coreSub={...stripeSub,id:`sub_core_${suffix}`,customer:coreRow.stripeCustomerId!,metadata:{shopId:core.shop.id},items:{data:[{...stripeSub.items.data[0],price:{id:"price_local_core_monthly"}}]}} as unknown as Stripe.Subscription;
const coreApi:StripeSyncApi={retrieveSubscription:async()=>coreSub,cancelSubscription:async()=>{throw Error("unexpected duplicate");}};
assert.equal(await confirmCheckoutSession("cs_local_core",core.shop.id,coreApi,async()=>({...session,id:"cs_local_core",client_reference_id:core.shop.id,status:"complete",subscription:coreSub.id})),"confirmed");
assert.equal(await processStripeEvent({id:`evt_core_${suffix}`,type:"customer.subscription.updated",data:{object:coreSub}} as Stripe.Event,coreApi),"processed");
assert.equal((await db.salesDemo.findUniqueOrThrow({where:{id:core.demo.id}})).status,"CONVERTED");proven("browser-first then webhook converges to the same terminal conversion");
const coreOwner=await db.user.findFirstOrThrow({where:{shopId:core.shop.id,role:"OWNER"}});setSession({user:{id:coreOwner.id,shopId:core.shop.id,role:"OWNER"}});
const coreEffective=await getEffectiveSubscription(core.shop.id);assert.equal(coreEffective.plan,"CORE");assert.equal(coreEffective.salesDemoId,undefined);proven("Complete demo to Core purchase uses Core commercial entitlement with no override");

const unpaid = await fixture();setSession(null);await activateDemoOwner(unpaid.demo.id,unpaid.token,"Local-QA-password-2026");
const unpaidOwner=await db.user.findFirstOrThrow({where:{shopId:unpaid.shop.id,role:"OWNER"}});
const unpaidRow=await db.subscription.findUniqueOrThrow({where:{shopId:unpaid.shop.id}});
const unpaidSub={...stripeSub,id:`sub_unpaid_${suffix}`,customer:unpaidRow.stripeCustomerId!,status:"past_due",metadata:{shopId:unpaid.shop.id}} as unknown as Stripe.Subscription;
const savedSubRetrieve=sdk.subscriptions.retrieve;const savedConfirmation=sdk.checkout.sessions.retrieve;
sdk.subscriptions.retrieve=(async()=>unpaidSub) as unknown as typeof savedSubRetrieve;
sdk.checkout.sessions.retrieve=(async()=>({...session,id:"cs_pending_local",client_reference_id:unpaid.shop.id,status:"complete",subscription:unpaidSub.id})) as unknown as typeof savedConfirmation;
setSession({user:{id:unpaidOwner.id,shopId:unpaid.shop.id,role:"OWNER"}});
try { const {confirmCheckoutAction}=await import("../src/actions/billing");assert.ok((await confirmCheckoutAction("cs_pending_local")).error);
  assert.equal((await db.salesDemo.findUniqueOrThrow({where:{id:unpaid.demo.id}})).status,"AWAITING_PAYMENT");proven("PAST_DUE Checkout evidence stays pending with a recoverable confirmation error");
} finally {sdk.subscriptions.retrieve=savedSubRetrieve;sdk.checkout.sessions.retrieve=savedConfirmation;}

await mkdir(".wave3-local", { recursive: true });
// Browser fixtures are local-only; generated secrets never leave this file/cluster.
const screenEN = await fixture("ACTIVE", "EN"); const screenFR = await fixture("ACTIVE", "FR");
const activationEN = await fixture("ACTIVATION_SENT", "EN"); const activationFR = await fixture("ACTIVATION_SENT", "FR");
const payment = await fixture("ACTIVATION_SENT", "FR"); setSession(null); await activateDemoOwner(payment.demo.id, payment.token, "Local-QA-password-2026");
await writeFile(".wave3-local/fixtures.json", JSON.stringify({ salesEmail: sales.email, screenEN: screenEN.demo.id, screenFR: screenFR.demo.id,
  activationEN: { id: activationEN.demo.id, token: activationEN.token }, activationFR: { id: activationFR.demo.id, token: activationFR.token }, paymentEmail: payment.demo.ownerEmail, paymentShop: payment.shop.id }, null, 2));
console.log(`${assertions} native PostgreSQL hostile/concurrency assertions passed; provider actions NONE.`);
await db.$disconnect();
