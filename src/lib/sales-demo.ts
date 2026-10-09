import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isDemoAvailable, isDemoSession, type DemoLike } from "@/domain/sales-demo";
import { can, canAccessDemoCreator, isActiveSalesStaffUser, resolvePlatformSalesActor } from "@/lib/sales-crm/access";

// Platform authorization uses the REAL user id, even when the session presents OWNER.
// Authority is a Super Admin or an ACTIVE platform sales staff member with `prepare_demo` (never tenant Role).
// `actor.id`/`actor.role` keep the historical shape; `actor.platform` carries the CRM scope.
export async function requireSalesActor() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("SALES_FORBIDDEN");
  const platform = await resolvePlatformSalesActor(session.user.id);
  if (!platform || !can(platform, "prepare_demo")) throw new Error("SALES_FORBIDDEN");
  return { session, actor: { id: platform.userId, role: platform.kind === "SUPER_ADMIN" ? "SUPER_ADMIN" : platform.kind, platform } };
}
/** A rep only reaches demos they created; a manager their team's; Super Admin all. Same error as an unavailable demo. */
function assertDemoScope(actor: Awaited<ReturnType<typeof requireSalesActor>>["actor"], demo: { createdByUserId?: string }) {
  if (actor.platform.all) return; // Super Admin: global scope
  if (!demo.createdByUserId || !canAccessDemoCreator(actor.platform, demo.createdByUserId)) throw new Error("DEMO_UNAVAILABLE");
}
export async function authorizedDemoSession(demo: DemoLike, now = new Date()) {
  // Background workers have no Next request/headers. They must resolve the
  // commercial state, never gain a demo override or fail just because it exists.
  let session;
  try { session = await auth(); } catch { return false; }
  if (!isDemoSession(session, demo, now)) return false;
  const actor = await db.user.findUnique({ where: { id: session!.user.id }, select: { role: true } });
  if (actor?.role === "SUPER_ADMIN") return true;
  // A sales rep/manager keeps the demo override only while their staff account is ACTIVE.
  return actor ? isActiveSalesStaffUser(session!.user.id) : false;
}
export async function requireCurrentDemo(demoId: string) {
  const { session, actor } = await requireSalesActor();
  const demo = await db.salesDemo.findUnique({ where: { id: demoId }, include: { shop: true } });
  if (!demo || !isDemoSession(session, demo)) throw new Error("DEMO_UNAVAILABLE");
  assertDemoScope(actor, demo);
  return { session, actor, demo };
}
export async function getCurrentDemo() {
  const session = await auth();
  const id = session?.impersonation?.salesDemoId;
  if (!id) return null;
  const demo = await db.salesDemo.findUnique({ where: { id }, include: { shop: true } });
  return demo && await authorizedDemoSession(demo) ? demo : null;
}
export async function requirePreparedDemo(demoId: string) {
  const { session, actor } = await requireSalesActor();
  const demo = await db.salesDemo.findUnique({ where: { id: demoId }, include: { shop: true } });
  if (!demo || !isDemoAvailable(demo)) throw new Error("DEMO_UNAVAILABLE");
  // An impersonated action can never target a different shop/demo.
  if (session.impersonation && !isDemoSession(session, demo)) throw new Error("DEMO_UNAVAILABLE");
  assertDemoScope(actor, demo);
  return { session, actor, demo };
}
