import Link from "next/link";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { listSellerAvailability } from "@/lib/sales-crm/review-queries";
import { loadTerritoryRules } from "@/lib/sales-crm/territory";
import { leadCopy } from "@/lib/admin-locale/sales-lead-engine";
import { PLATFORM } from "@/lib/routes";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { AssignmentPanel } from "@/components/sales-crm/AssignmentPanel";

export default async function AssignmentPage() {
  const { actor, t, locale } = await loadCrmPage("reassign_prospects");
  if (!actor) return <PermissionDenied t={t} />;
  const L = leadCopy(locale);
  const [sellers, rules] = await Promise.all([listSellerAvailability(actor), loadTerritoryRules()]);
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href={PLATFORM.salesProspects} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {t.common.back}</Link>
      <PageHeader title={L.assignment.title} />
      <p className="text-sm text-slate-600">{L.assignment.help}</p>
      <AssignmentPanel locale={locale} sellers={sellers} territories={rules.map((r) => ({ key: r.key, name: locale === "fr" ? r.nameFr ?? r.key : r.nameEn ?? r.key }))} isSuperAdmin={actor.all} />
    </div>
  );
}
