import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { MAX_LOGO_BYTES, validateLogo } from "../src/lib/logo-upload";
import { db } from "../src/lib/db";
import { resolveActiveEmailRoute } from "../src/lib/communications/sender-identity";
import nextConfig from "../next.config";

function mockRoute(t: TestContext, result: unknown) {
  const original = db.communicationRoute.findUnique;
  const lookup = t.mock.fn(async (...args: unknown[]) => {
    assert.equal(args.length, 1);
    return result;
  });
  db.communicationRoute.findUnique = lookup as unknown as typeof original;
  t.after(() => { db.communicationRoute.findUnique = original; });
  return lookup;
}

test("logo validation accepts files above 1 MiB through 4 MiB and rejects oversized or invalid files", () => {
  assert.equal(validateLogo({ size: 2 * 1024 * 1024, type: "image/png" }), null);
  assert.equal(validateLogo({ size: MAX_LOGO_BYTES, type: "image/jpeg" }), null);
  assert.equal(validateLogo({ size: MAX_LOGO_BYTES + 1, type: "image/png" }), "tooLarge");
  assert.equal(validateLogo({ size: 0, type: "image/png" }), "empty");
  assert.equal(validateLogo({ size: 100, type: "application/pdf" }), "invalidType");
});

test("web contact uses its active route even when the legacy shop has no email", async (t) => {
  const lookup = mockRoute(t, {
    senderIdentity: { id: "sender", address: "web@example.com", status: "ACTIVE", displayName: "Shop" },
  });
  const route = await resolveActiveEmailRoute({ id: "shop", name: "Shop" }, "WEB_CONTACT");
  assert.equal(route.fromAddress, "web@example.com");
  assert.equal(route.replyTo, "web@example.com");
  assert.deepEqual((lookup.mock.calls[0].arguments as unknown as [{ where: unknown }])[0].where, {
    shopId_purpose_channel: { shopId: "shop", purpose: "WEB_CONTACT", channel: "EMAIL" },
  });
});

test("unconfigured routes still use the legacy shop email", async (t) => {
  mockRoute(t, null);
  const route = await resolveActiveEmailRoute({ id: "shop", name: "Shop", infoEmail: "info@example.com" }, "WEB_CONTACT");
  assert.equal(route.fromAddress, "info@example.com");
});

test("inactive identities are not used for sending", async (t) => {
  mockRoute(t, {
    senderIdentity: { id: "sender", address: "inactive@example.com", status: "SUSPENDED" },
  });
  const route = await resolveActiveEmailRoute({ id: "shop", name: "Shop", infoEmail: "info@example.com" }, "WEB_CONTACT");
  assert.equal(route.fromAddress, "info@example.com");
});

test("a maximum-size multipart logo fits both the Server Action and Vercel request budgets", async () => {
  const form = new FormData();
  form.append("logo", new File([new Uint8Array(MAX_LOGO_BYTES)], "logo.png", { type: "image/png" }));
  const request = new Request("http://localhost/admin/settings", { method: "POST", body: form });
  const bytes = (await request.arrayBuffer()).byteLength;
  const configuredLimit = nextConfig.experimental?.serverActions?.bodySizeLimit;
  assert.ok(typeof configuredLimit === "string");
  assert.match(configuredLimit, /^\d+(\.\d+)?mb$/i);
  assert.ok(bytes < parseFloat(configuredLimit) * 1024 * 1024);
  assert.ok(bytes < 4_500_000);
});

test("external newsletter routes do not query transactional sender identities", async (t) => {
  const lookup = mockRoute(t, null);
  const route = await resolveActiveEmailRoute({ id: "shop", name: "Shop", newsletterEmail: "news@example.com" }, "NEWSLETTER");
  assert.equal(route.pipeline, "external");
  assert.equal(lookup.mock.callCount(), 0);
});
