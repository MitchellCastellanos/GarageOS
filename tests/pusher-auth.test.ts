import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { setSession } from "./helpers/action-harness";
import { patchDb } from "./helpers/db-mock";

process.env.PUSHER_APP_ID = "1";
process.env.PUSHER_KEY = "testkey";
process.env.PUSHER_SECRET = "testsecret";
process.env.PUSHER_CLUSTER = "us2";

const route = await import("../src/app/api/pusher/auth/route");
const { parsePusherChannel, platformConversationChannel, staffNotificationChannel, PLATFORM_MESSAGES_CHANNEL } =
  await import("../src/lib/platform/pusher-channels");

const SOCKET = "1234.5678";
const A = { id: "userA", role: "OWNER", shopId: "shopA" };
const B = { id: "userB", role: "OWNER", shopId: "shopB" };
const ADMIN = { id: "root", role: "SUPER_ADMIN", shopId: null };

function req(channel: string, socket: string = SOCKET) {
  const body = new URLSearchParams({ socket_id: socket, channel_name: channel });
  return new Request("http://x/api/pusher/auth", { method: "POST", body });
}

function convs(t: Parameters<typeof patchDb>[0]) {
  patchDb(t, "platformConversation", "findUnique", (async (args: { where: { id: string } }) =>
    ({ convA: { shopId: "shopA" }, convB: { shopId: "shopB" } } as Record<string, { shopId: string }>)[args.where.id] ?? null) as never);
}

test("unauthenticated request cannot get any channel signature", async () => {
  setSession(null);
  assert.equal((await route.POST(req(staffNotificationChannel("userA")))).status, 401);
});

test("user can authorise only their own staff-notification channel", async (t) => {
  convs(t);
  setSession({ user: A });
  const ok = await route.POST(req(staffNotificationChannel("userA")));
  assert.equal(ok.status, 200);
  const { auth } = (await ok.json()) as { auth: string };
  const expected = createHmac("sha256", "testsecret").update(`${SOCKET}:${staffNotificationChannel("userA")}`).digest("hex");
  assert.equal(auth, `testkey:${expected}`, "signature is bound to this exact socket + channel");
  // otro usuario del MISMO taller, y de otro taller
  assert.equal((await route.POST(req(staffNotificationChannel("userB")))).status, 403);
  setSession({ user: { ...A, id: "colleague" } });
  assert.equal((await route.POST(req(staffNotificationChannel("userA")))).status, 403);
});

test("Shop A cannot authorise Shop B's support conversation; Shop B can; super admin can", async (t) => {
  convs(t);
  setSession({ user: A });
  assert.equal((await route.POST(req(platformConversationChannel("convA")))).status, 200);
  assert.equal((await route.POST(req(platformConversationChannel("convB")))).status, 403, "cross-tenant");
  assert.equal((await route.POST(req(platformConversationChannel("nope")))).status, 403, "unknown conversation");
  setSession({ user: B });
  assert.equal((await route.POST(req(platformConversationChannel("convB")))).status, 200);
  assert.equal((await route.POST(req(platformConversationChannel("convA")))).status, 403);
  setSession({ user: ADMIN });
  assert.equal((await route.POST(req(platformConversationChannel("convA")))).status, 200);
  assert.equal((await route.POST(req(platformConversationChannel("convB")))).status, 200);
});

test("user with no shop cannot join shop conversations", async (t) => {
  convs(t);
  setSession({ user: { id: "x", role: "OWNER", shopId: null } });
  assert.equal((await route.POST(req(platformConversationChannel("convA")))).status, 403);
});

test("platform inbox channel is super-admin only", async (t) => {
  convs(t);
  setSession({ user: A });
  assert.equal((await route.POST(req(PLATFORM_MESSAGES_CHANNEL))).status, 403);
  setSession({ user: ADMIN });
  assert.equal((await route.POST(req(PLATFORM_MESSAGES_CHANNEL))).status, 200);
});

test("crafted channel names are rejected (fail closed)", async (t) => {
  convs(t);
  setSession({ user: A });
  const crafted = [
    "platform-conversation-convA", "staff-notifications-userA", "platform-messages-admin", // sin prefijo private-
    "presence-platform-conversation-convA", "private-encrypted-platform-conversation-convA",
    "private-platform-conversation-convA ", " private-platform-conversation-convA",
    "private-platform-conversation-convA/../convB", "private-platform-conversation-convB%00convA",
    "private-platform-conversation-", "private-platform-conversation-convA:extra", "private-staff-notifications-userA\nx",
    "private-platform-conversation-" + "a".repeat(200), "private-other-userA", "",
  ];
  for (const c of crafted) assert.equal((await route.POST(req(c))).status, 403, JSON.stringify(c));
  assert.equal(parsePusherChannel(undefined), null);
  assert.equal(parsePusherChannel(["private-staff-notifications-userA"]), null);
});

test("malformed socket_id / body is rejected before any authorisation", async (t) => {
  convs(t);
  setSession({ user: A });
  assert.equal((await route.POST(req(staffNotificationChannel("userA"), "abc"))).status, 400);
  assert.equal((await route.POST(req(staffNotificationChannel("userA"), "1.2.3"))).status, 400);
  assert.equal((await route.POST(new Request("http://x", { method: "POST", body: "{}" }))).status, 400);
});

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

test("codebase guard: no public Pusher channel names and every client uses the auth endpoint", () => {
  for (const file of walk("src")) {
    const src = readFileSync(file, "utf8");
    if (!file.endsWith("platform/pusher-channels.ts") && !file.endsWith("platform/pusher-authz.ts")) {
      assert.doesNotMatch(src, /["'`](?:platform-conversation|staff-notifications|platform-messages-admin)/, `${file} hard-codes a public channel name`);
    }
    if (/new Pusher\(process\.env\.NEXT_PUBLIC_PUSHER_KEY/.test(src)) {
      assert.match(src, /PUSHER_CLIENT_AUTH/, `${file} creates a Pusher client without private-channel auth`);
    }
  }
});
