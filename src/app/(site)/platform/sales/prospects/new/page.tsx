import Link from "next/link";
import { listAssignableStaff } from "@/lib/sales-crm/queries";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { PLATFORM } from "@/lib/routes";
import { PageHeader, PermissionDenied, cardCls } from "@/components/sales-crm/ui";
import { ProspectForm } from "@/components/sales-crm/ProspectForm";

export default async function NewProspectPage() {
  const { actor, t, locale } = await loadCrmPage("manage_prospects");
  if (!actor) return <PermissionDenied t={t} />;
  const staff = await listAssignableStaff(actor);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={PLATFORM.salesProspects} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {t.common.back}</Link>
      <PageHeader title={t.prospects.form.createTitle} />
      <div className={cardCls}>
        <ProspectForm locale={locale} staff={staff} canAssign={actor.all || actor.kind === "SALES_MANAGER"} values={{ assignedStaffId: actor.staffId }} />
      </div>
    </div>
  );
}
