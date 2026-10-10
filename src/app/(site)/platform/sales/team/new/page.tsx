import Link from "next/link";
import { db } from "@/lib/db";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { PLATFORM } from "@/lib/routes";
import { PageHeader, PermissionDenied, cardCls } from "@/components/sales-crm/ui";
import { StaffForm } from "@/components/sales-crm/StaffForm";

export default async function NewStaffPage() {
  const { actor, t, locale } = await loadCrmPage("manage_team");
  if (!actor) return <PermissionDenied t={t} />;
  const [managers, terr] = await Promise.all([
    db.platformSalesStaff.findMany({ where: { role: "SALES_MANAGER", status: { not: "INACTIVE" } }, select: { id: true, user: { select: { name: true } } } }),
    db.crmTerritory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { key: true, nameEn: true, nameFr: true } }),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={PLATFORM.salesTeam} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {t.common.back}</Link>
      <PageHeader title={t.team.createTitle} subtitle={t.team.createHelp} />
      <div className={cardCls}><StaffForm locale={locale} territories={terr.map((x) => ({ key: x.key, label: locale === "fr" ? x.nameFr : x.nameEn }))} managers={managers.map((m) => ({ id: m.id, name: m.user.name }))} /></div>
    </div>
  );
}
