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
  assert.match(wf, /secrets\.SALES_CRON_SECRET/);
  assert.match(wf, /Authorization: Bearer/);
  assert.match(wf, /\/api\/webhooks\/cron\/lead-radar/);
});

test("endpoint stays cron-authenticated and Vercel Hobby cron stays daily (no sub-daily native cron)", () => {
  assert.match(readFileSync("src/app/api/webhooks/cron/lead-radar/route.ts", "utf8"), /isAuthorizedCronRequest\(request\)\) return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/);
  const crons = (JSON.parse(readFileSync("vercel.json", "utf8")).crons as { schedule: string }[]);
  for (const c of crons) assert.match(c.schedule, /^\d+ \d+ \* \* \*$/);
});
