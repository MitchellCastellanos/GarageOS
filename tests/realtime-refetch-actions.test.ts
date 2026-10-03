// The realtime signal makes clients refetch through these server actions. They are the ONLY place customer/support
// content is served after the Pusher minimization (docs/compliance/privacy-impact-assessment.md, flow 7), so the
// tenant boundary must hold here: a shop sees only its own conversation; only a super admin reads any conversation;
// staff notifications are scoped to the signed-in user.
import assert from "node:assert/strict";
import test from "node:test";
import { setSession, RedirectError } from "./helpers/action-harness";
import { patchDb } from "./helpers/db-mock";

const support = await import("../src/actions/support");
const platformMsgs = await import("../src/actions/platform-messages");
const staffNotifs = await import("../src/actions/staff-notifications");

const d = (iso: string) => new Date(iso);

test("shop support refetch: queries ONLY the signed-in shop's conversation and returns serialized rows", async (t) => {
  setSession({ user: { id: "u1", role: "OWNER", shopId: "shop-A" } });
  const find = patchDb(t, "platformConversation", "findFirst", (async () => ({
    id: "c1",
    shopId: "shop-A",
    messages: [{ id: "m1", sender: "SHOP", content: "hello", createdAt: d("2026-10-02T10:00:00Z") }],
  })) as never);
  const rows = await support.getMySupportMessages();
  assert.deepEqual(rows, [{ id: "m1", sender: "SHOP", content: "hello", createdAt: "2026-10-02T10:00:00.000Z" }]);
  const where = (find.mock.calls[0].arguments as unknown as [{ where: { shopId: string } }])[0].where;
  assert.equal(where.shopId, "shop-A", "scoped to the session's shop, never to a client-supplied id");
});

test("shop support refetch: a user with no shop gets nothing and no query runs", async (t) => {
  setSession({ user: { id: "u9", role: "OWNER", shopId: null } });
  const find = patchDb(t, "platformConversation", "findFirst", (async () => ({ id: "x", messages: [] })) as never);
  assert.deepEqual(await support.getMySupportMessages(), []);
  assert.equal(find.mock.callCount(), 0);
});

test("platform thread refetch: only a super admin; a shop owner is redirected before any query", async (t) => {
  const find = patchDb(t, "platformMessage", "findMany", (async () => [
    { id: "m1", sender: "SUPER_ADMIN", content: "reply", createdAt: d("2026-10-02T11:00:00Z") },
  ]) as never);

  setSession({ user: { id: "u1", role: "OWNER", shopId: "shop-A" } });
  await assert.rejects(platformMsgs.getPlatformConversationMessages("c-of-shop-B"), (e) => e instanceof RedirectError);
  assert.equal(find.mock.callCount(), 0, "no data is read for a non-super-admin");

  setSession({ user: { id: "admin", role: "SUPER_ADMIN", shopId: null } });
  const rows = await platformMsgs.getPlatformConversationMessages("c1");
  assert.deepEqual(rows, [{ id: "m1", sender: "SUPER_ADMIN", content: "reply", createdAt: "2026-10-02T11:00:00.000Z" }]);
  assert.equal((find.mock.calls[0].arguments as unknown as [{ where: { conversationId: string } }])[0].where.conversationId, "c1");
});

test("staff notification refetch: scoped to the signed-in user only", async (t) => {
  setSession({ user: { id: "u1", role: "OWNER", shopId: "shop-A" } });
  const list = patchDb(t, "staffNotification", "findMany", (async () => [
    { id: "n1", title: "t", body: "b", href: "/admin/inbox/x", readAt: null, createdAt: d("2026-10-02T12:00:00Z") },
  ]) as never);
  const count = patchDb(t, "staffNotification", "count", (async () => 1) as never);
  const res = await staffNotifs.getMyStaffNotifications();
  assert.equal(res.unreadCount, 1);
  assert.equal(res.notifications[0].id, "n1");
  assert.equal((list.mock.calls[0].arguments as unknown as [{ where: { userId: string } }])[0].where.userId, "u1");
  assert.equal((count.mock.calls[0].arguments as unknown as [{ where: { userId: string } }])[0].where.userId, "u1");
});
