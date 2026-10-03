/* eslint-disable @typescript-eslint/no-explicit-any -- SDK fakes are loosely typed on purpose */
// Privacy minimization of realtime (PIA flow 7): Pusher carries only opaque signals; the authenticated client refetches
// the content through session-checked server actions. These tests pin (a) the exact payload that reaches the Pusher
// SDK, (b) that no personal content can be smuggled through the publish boundary, (c) the refresh coalescing, and
// (d) that no client component renders content straight from a Pusher event.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { join, relative } from "node:path";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

process.env.PUSHER_APP_ID = "1";
process.env.PUSHER_KEY = "fakekey";
process.env.PUSHER_SECRET = "fakesecret";
process.env.PUSHER_CLUSTER = "us2";
process.env.PROVIDER_SIDE_EFFECTS = "enabled";

const providers = await import("../src/lib/providers/pusher");
const platform = await import("../src/lib/platform/pusher");
const staff = await import("../src/lib/staff-notify-realtime");
const { coalescedRefresh } = await import("../src/lib/realtime-refresh");

function fakeClient() {
  const client = providers.getPusherForPublish() as any;
  assert.ok(client, "publish client available with side effects enabled");
  const triggered: { channel: string; event: string; data: any }[] = [];
  client.trigger = async (channel: string, event: string, data: any) => (triggered.push({ channel, event, data }), { status: 200 });
  return triggered;
}

const PII = ["Marie Tremblay", "+15145550123", "marie@example.test", "Honda Civic ABC123", "INV-0042", "brake job"];

test("staff notification: only an opaque signal reaches Pusher (no title/body/href, no customer data)", async () => {
  const triggered = fakeClient();
  await staff.publishStaffNotification("user-1", {
    id: "ntf_1",
    title: "New message from Marie Tremblay",
    body: "Hi, is the Honda Civic ABC123 ready? call +15145550123 or marie@example.test (INV-0042 brake job)",
    href: "/admin/inbox/thread_secret_id",
    createdAt: "2026-10-02T10:00:00.000Z",
  });
  assert.equal(triggered.length, 1);
  assert.equal(triggered[0].channel, "private-staff-notifications-user-1");
  assert.equal(triggered[0].event, "notification");
  assert.deepEqual(triggered[0].data, { id: "ntf_1", section: "inbox", createdAt: "2026-10-02T10:00:00.000Z" });
  const wire = JSON.stringify(triggered[0].data);
  for (const p of PII) assert.ok(!wire.includes(p), `payload must not contain ${p}`);
  assert.ok(!wire.includes("thread_secret_id"), "internal record ids in href are not published");
});

test("staff notification sections: inbox, appointments, everything else → null", () => {
  const sig = (href: string | null) => staff.toStaffNotificationSignal({ id: "1", title: "t", body: "b", href, createdAt: "x" }).section;
  assert.equal(sig("/admin/inbox"), "inbox");
  assert.equal(sig("/admin/inbox/abc"), "inbox");
  assert.equal(sig("/admin/appointments"), "appointments");
  assert.equal(sig("/admin/quotes/q1"), null);
  assert.equal(sig("/admin/settings?tab=billing"), null);
  assert.equal(sig(null), null);
});

test("platform support message: the text never reaches Pusher, only id/sender/time", async () => {
  const triggered = fakeClient();
  await platform.publishPlatformMessage("conv-1", {
    id: "msg_1",
    sender: "SHOP",
    content: "Please look at customer Marie Tremblay +15145550123",
    createdAt: "2026-10-02T10:00:00.000Z",
  });
  assert.equal(triggered.length, 1);
  assert.equal(triggered[0].channel, "private-platform-conversation-conv-1");
  assert.equal(triggered[0].event, "message");
  assert.deepEqual(triggered[0].data, { id: "msg_1", sender: "SHOP", createdAt: "2026-10-02T10:00:00.000Z" });
  assert.ok(!JSON.stringify(triggered[0].data).includes("Marie"));
});

test("platform admin signals carry no data (unchanged)", async () => {
  const triggered = fakeClient();
  await platform.publishPlatformConversationUpdate("conv-9");
  await platform.publishPlatformPendingChanged();
  assert.deepEqual(triggered.map((t) => [t.event, t.data]), [["conversation-updated", { conversationId: "conv-9" }], ["pending-changed", {}]]);
});

test("coalescedRefresh: a burst of signals never runs two refreshes at once and ends with exactly one trailing refresh", async () => {
  let concurrent = 0;
  let maxConcurrent = 0;
  let runs = 0;
  const run = coalescedRefresh(async () => {
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    runs++;
    await new Promise((r) => setTimeout(r, 15));
    concurrent--;
  });
  await Promise.all([run(), run(), run(), run(), run()]);
  assert.equal(maxConcurrent, 1, "never concurrent");
  assert.equal(runs, 2, "first run + ONE trailing run for the whole burst");
  await run();
  assert.equal(runs, 3, "a later signal starts a fresh run");
});

test("coalescedRefresh: errors are reported, never thrown, and the next signal still refreshes", async () => {
  const errors: unknown[] = [];
  let calls = 0;
  const run = coalescedRefresh(async () => {
    calls++;
    if (calls === 1) throw new Error("boom");
  }, (e) => errors.push(e));
  await run();
  await run();
  assert.equal(errors.length, 1);
  assert.equal(calls, 2);
});

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

test("codebase guard: Pusher event handlers never read content from the event payload", () => {
  const root = join(import.meta.dirname, "..", "src");
  let bound = 0;
  for (const file of walk(root)) {
    const src = readFileSync(file, "utf8");
    if (!/channel\.bind\(/.test(src)) continue;
    const rel = relative(root, file);
    // Handlers may only use a signal's `section`; no title/body/content/href/clientName reads from the event.
    const handlers = [...src.matchAll(/const handler = \(([^)]*)\)\s*=>\s*\{([\s\S]*?)\n\s{6}\};/g)];
    bound += handlers.length;
    for (const [, params, body] of handlers) {
      const name = params.split(":")[0].trim();
      if (!name) continue;
      for (const field of ["title", "body", "content", "href", "clientName", "phone", "email"]) {
        assert.ok(!new RegExp(`\\b${name}\\.${field}\\b`).test(body), `${rel}: handler reads ${name}.${field} from a Pusher event`);
      }
    }
  }
  assert.ok(bound >= 4, `expected to inspect the 4 Pusher handlers (NotificationBell, Sidebar, SupportChat, PlatformConversationThread), found ${bound}`);
});
