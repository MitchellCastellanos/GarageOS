import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlatformChrome } from "@/components/admin/PlatformChrome";
import { getPlatformPendingCount } from "@/actions/platform";
import { requireSession } from "@/lib/permissions";
import { resolvePlatformSalesActor } from "@/lib/sales-crm/access";
import { ADMIN } from "@/lib/routes";
import { canViewRoutes } from "@/domain/sales-crm/field-route";
import { leadRadarAccessFor } from "@/lib/lead-radar/access";
import { readSettings } from "@/lib/lead-radar/settings";

// Panel interno de la plataforma: nunca indexable.
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

// /platform admits Super Admin AND active platform sales staff. The layout only decides who may see the shell;
// every page/action enforces its own capability (Super Admin-only pages call requireSuperAdmin()).
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (session.impersonation) redirect(ADMIN.dashboard);
  const actor = await resolvePlatformSalesActor(session.user.id);
  if (!actor) redirect(ADMIN.dashboard);
  const pendingCounts = actor.kind === "SUPER_ADMIN" ? await getPlatformPendingCount() : { waitingMessages: 0, pendingSmsRequests: 0 };

  // Convenience only (hides the menu entry); every Lead Radar page and action re-checks on the server.
  const leadRadar = actor.kind === "SALES_REP" ? false : leadRadarAccessFor(actor, (await readSettings()).managersCanReview).review;
  return (
    <PlatformChrome userName={session.user.name} pendingCounts={pendingCounts} nav={{ kind: actor.kind, locale: actor.uiLocale, fieldPlanner: canViewRoutes(actor), leadRadar }}>
      {children}
    </PlatformChrome>
  );
}
