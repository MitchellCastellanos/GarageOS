import Link from "next/link";
import { requireSalesActor } from "@/lib/sales-demo";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { salesDemoCopy } from "@/lib/admin-locale/sales-demo";
import { crmCopy } from "@/lib/admin-locale/sales-crm";
import { ProspectForm } from "@/components/sales-demo/ProspectForm";
import { PLATFORM } from "@/lib/routes";
import { db } from "@/lib/db";
import { assignedScopeWhere } from "@/domain/sales-crm/access";

export default async function NewSalesDemoPage({ searchParams }: { searchParams: Promise<{ opportunity?: string }> }) {
  const { actor } = await requireSalesActor();
  const locale = await getAdminLocale();
  const t = salesDemoCopy(locale);
  const c = crmCopy(locale);
  // Prefill from a CRM opportunity the seller can actually access; anything else is ignored (no leakage, no error).
  const { opportunity: opportunityId } = await searchParams;
  const opp = opportunityId
    ? await db.crmOpportunity.findFirst({
        where: { id: opportunityId, prospect: assignedScopeWhere(actor.platform), stage: { notIn: ["WON", "LOST", "UNQUALIFIED", "DO_NOT_CONTACT"] } },
        select: { id: true, prospect: { select: { name: true, address: true, phone: true, email: true, preferredLanguage: true, contacts: { where: { archivedAt: null }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { name: true, email: true, phone: true, preferredLanguage: true } } } } },
      })
    : null;
  const contact = opp?.prospect.contacts[0];
  const lang = contact?.preferredLanguage ?? opp?.prospect.preferredLanguage;
  return <div className="mx-auto max-w-3xl space-y-5">
    <Link className="inline-flex min-h-11 items-center text-blue-700" href={PLATFORM.salesDemos}>{t.back}</Link>
    <h1 className="text-2xl font-semibold">{t.newDemo}</h1>
    {opp && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">{c.demos.fromProspect} <b>{opp.prospect.name}</b>. {c.demos.linkNote}</p>}
    <ProspectForm locale={locale} opportunityId={opp?.id} defaults={opp ? {
      name: opp.prospect.name, address: opp.prospect.address ?? "", phone: opp.prospect.phone ?? "", email: opp.prospect.email ?? "",
      contactName: contact?.name ?? "", contactEmail: contact?.email ?? "", contactPhone: contact?.phone ?? "",
      // The demo form only supports FR/EN; an unknown language stays a deliberate human choice (form default = viewer's UI language).
      ...(lang === "FR" || lang === "EN" ? { preferredLanguage: lang } : {}),
    } : {}} />
  </div>;
}
