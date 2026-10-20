// The phone-first operations endpoint fails closed without the cron secret, and mutating stages never run without an explicit apply=1.
import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/action-harness";

process.env.LEAD_RADAR_CRON_SECRET = "s".repeat(40);
const { GET } = await import("../src/app/api/webhooks/cron/phone-first/route");
const req = (qs: string, auth?: string) => new Request(`https://x.test/api/webhooks/cron/phone-first?${qs}`, { headers: auth ? { authorization: auth } : {} });

test("no secret / wrong secret / 'Bearer undefined' are all 401", async () => {
  for (const a of [undefined, "Bearer nope", "Bearer undefined", `Bearer ${"s".repeat(39)}`, "s".repeat(40)]) assert.equal((await GET(req("stage=inventory", a))).status, 401);
});

test("unknown stage with a valid secret is a 400, not a crash", async () => {
  const r = await GET(req("stage=nope", `Bearer ${"s".repeat(40)}`));
  assert.equal(r.status, 400);
});
