import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wf = readFileSync(".github/workflows/lead-radar-cron.yml", "utf8");
const cron = /- cron: "([^"]+)"/.exec(wf)?.[1] ?? "";

test("Lead Radar cron runs every 15 minutes, 11:00–23:59 UTC, all seven days", () => {
  assert.deepEqual(cron.split(" ").slice(0, 5), ["*/15", "11-23", "*", "*", "*"]);
});

test("workflow has no weekday guard, does not overlap, and is read-only", () => {
  assert.ok(!/github\.event\.schedule|getDay|date \+%u|1-5/.test(wf.replace(/#.*$/gm, "")));
  assert.match(wf, /concurrency:\s*\n\s*group: lead-radar-cron\s*\n\s*cancel-in-progress: false/);
  assert.match(wf, /permissions:\s*\n\s*contents: read/);
});

test("scheduler authenticates with the existing secrets and calls the existing endpoint", () => {
  assert.match(wf, /secrets\.LEAD_RADAR_CRON_SECRET/);
  assert.ok(!/SALES_CRON_SECRET/.test(wf.replace(/#.*$/gm, "")));
  assert.match(wf, /Authorization: Bearer/);
  assert.match(wf, /\/api\/webhooks\/cron\/lead-radar/);
});

test("missing secret fails the workflow instead of skipping successfully", () => {
  const run = wf.replace(/#.*$/gm, "");
  assert.ok(!/exit 0/.test(run));
  assert.match(run, /-z "\$SECRET"[\s\S]*?::error::[\s\S]*?exit 1/);
});

test("endpoint stays cron-authenticated and Vercel Hobby cron stays daily (no sub-daily native cron)", () => {
  assert.match(readFileSync("src/app/api/webhooks/cron/lead-radar/route.ts", "utf8"), /authorized\(request\)\) return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/);
  const crons = (JSON.parse(readFileSync("vercel.json", "utf8")).crons as { schedule: string }[]);
  for (const c of crons) assert.match(c.schedule, /^\d+ \d+ \* \* \*$/);
});

test("LEAD_RADAR_CRON_SECRET is accepted only by the Lead Radar endpoint; CRON_SECRET remains a fallback there", () => {
  const route = readFileSync("src/app/api/webhooks/cron/lead-radar/route.ts", "utf8");
  assert.match(route, /isAuthorizedCronRequest\(request, process\.env\.LEAD_RADAR_CRON_SECRET\) \|\| isAuthorizedCronRequest\(request\)/);
  for (const f of ["cron/route.ts", "cron/campaigns/route.ts", "cron/quickbooks/route.ts", "cron/sales/route.ts"]) {
    assert.ok(!readFileSync(`src/app/api/webhooks/${f}`, "utf8").includes("LEAD_RADAR_CRON_SECRET"), f);
  }
  assert.ok(!readFileSync("src/app/api/lead-radar/worker/route.ts", "utf8").includes("LEAD_RADAR_CRON_SECRET"));
});

test("bearer validation rejects missing, wrong, short and cross-endpoint secrets", async () => {
  const { isAuthorizedCronRequest } = await import("../src/lib/cron-auth");
  const req = (h?: string) => new Request("https://x.test/", { headers: h ? { authorization: h } : {} });
  const lr = "lead-radar-secret-0123456789", vercel = "vercel-cron-secret-0123456789";
  assert.equal(isAuthorizedCronRequest(req(`Bearer ${lr}`), lr), true);
  assert.equal(isAuthorizedCronRequest(req(), lr), false);
  assert.equal(isAuthorizedCronRequest(req("Bearer wrong-wrong-wrong-wrong"), lr), false);
  assert.equal(isAuthorizedCronRequest(req("Bearer undefined"), undefined), false);
  assert.equal(isAuthorizedCronRequest(req(`Bearer ${lr}`), vercel), false); // dedicated secret does not satisfy CRON_SECRET-protected endpoints
  assert.equal(isAuthorizedCronRequest(req(`Bearer ${vercel}`), vercel), true);
});
