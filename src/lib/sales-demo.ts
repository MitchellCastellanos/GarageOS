import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isDemoAvailable, isDemoSession, type DemoLike } from "@/domain/sales-demo";

// Platform authorization uses the REAL user id, even when the session presents OWNER.
// Future platform Sales permissions belong here, never in tenant Role.
export async function requireSalesActor() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("SALES_FORBIDDEN");
  const actor = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true } });
  if (actor?.role !== "SUPER_ADMIN") throw new Error("SALES_FORBIDDEN");
  return { session, actor };
}
export async function authorizedDemoSession(demo: DemoLike, now = new Date()) {
  // Background workers have no Next request/headers. They must resolve the
  // commercial state, never gain a demo override or fail just because it exists.
  let session;
  try { session = await auth(); } catch { return false; }
  if (!isDemoSession(session, demo, now)) return false;
  const actor = await db.user.findUnique({ where: { id: session!.user.id }, select: { role: true } });
  return actor?.role === "SUPER_ADMIN";
}
export async function requireCurrentDemo(demoId: string) {
  const { session, actor } = await requireSalesActor();
  const demo = await db.salesDemo.findUnique({ where: { id: demoId }, include: { shop: true } });
  if (!demo || !isDemoSession(session, demo)) throw new Error("DEMO_UNAVAILABLE");
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
  return { session, actor, demo };
}
