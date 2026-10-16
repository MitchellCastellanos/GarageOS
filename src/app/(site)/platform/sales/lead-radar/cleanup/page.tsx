import Link from "next/link";
import { cleanupCopy } from "@/lib/admin-locale/lead-radar-cleanup";
import { PLATFORM } from "@/lib/routes";
import { loadRadarPage } from "@/lib/lead-radar/page";
import { btnSecondary, PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { RepairFitPanel } from "@/components/lead-radar/RepairFitPanel";

export const dynamic = "force-dynamic";

export default async function LeadRadarCleanupPage() {
  const { actor, access, locale, t } = await loadRadarPage("review");
  if (!actor || !access?.review) return <PermissionDenied t={t} />;
  const d = cleanupCopy(locale);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title={d.title} subtitle={d.subtitle} actions={<Link className={btnSecondary} href={PLATFORM.salesLeadRadar}>{d.back}</Link>} />
      <RepairFitPanel locale={locale} isAdmin={!!access.admin && actor.all} />
    </div>
  );
}
