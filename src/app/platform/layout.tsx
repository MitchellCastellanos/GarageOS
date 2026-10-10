import { redirect } from "next/navigation";
import { PlatformChrome } from "@/components/admin/PlatformChrome";
import { getPlatformPendingCount } from "@/actions/platform";
import { requireSession } from "@/lib/permissions";
import { resolvePlatformSalesActor } from "@/lib/sales-crm/access";
import { ADMIN } from "@/lib/routes";
import { canViewRoutes } from "@/domain/sales-crm/field-route";

// /platform admits Super Admin AND active platform sales staff. The layout only decides who may see the shell;
// every page/action enforces its own capability (Super Admin-only pages call requireSuperAdmin()).
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (session.impersonation) redirect(ADMIN.dashboard);
  const actor = await resolvePlatformSalesActor(session.user.id);
  if (!actor) redirect(ADMIN.dashboard);
  const pendingCounts = actor.kind === "SUPER_ADMIN" ? await getPlatformPendingCount() : { waitingMessages: 0, pendingSmsRequests: 0 };

  return (
    <PlatformChrome userName={session.user.name} pendingCounts={pendingCounts} nav={{ kind: actor.kind, locale: actor.uiLocale, fieldPlanner: canViewRoutes(actor) }}>
      {children}
    </PlatformChrome>
  );
}
