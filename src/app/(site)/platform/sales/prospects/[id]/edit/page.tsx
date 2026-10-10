import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { assignedScopeWhere } from "@/domain/sales-crm/access";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { PLATFORM } from "@/lib/routes";
import { PageHeader, PermissionDenied, cardCls } from "@/components/sales-crm/ui";
import { ProspectForm } from "@/components/sales-crm/ProspectForm";

export default async function EditProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, t, locale } = await loadCrmPage("manage_prospects");
  if (!actor) return <PermissionDenied t={t} />;
  const { id } = await params;
  const p = await db.crmProspect.findFirst({ where: { id, ...assignedScopeWhere(actor) } });
  if (!p) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={PLATFORM.salesProspect(id)} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {t.common.back}</Link>
      <PageHeader title={t.prospects.form.editTitle} subtitle={p.name} />
      <div className={cardCls}><ProspectForm locale={locale} prospectId={id} staff={[]} canAssign={false} values={p} /></div>
    </div>
  );
}
