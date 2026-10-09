import { db } from "@/lib/db";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { NeedsAdmin } from "@/components/sales-crm/NeedsAdmin";

export default async function NeedsSettingsPage() {
  const { actor, t, locale } = await loadCrmPage("manage_needs_taxonomy");
  if (!actor) return <PermissionDenied t={t} />;
  const defs = await db.crmNeedDefinition.findMany({ orderBy: [{ sortOrder: "asc" }, { key: "asc" }] });
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={t.needsAdmin.title} />
      <NeedsAdmin locale={locale} definitions={defs.map((d) => ({ id: d.id, key: d.key, category: d.category, labelEn: d.labelEn, labelFr: d.labelFr, weight: d.weight, sortOrder: d.sortOrder, active: d.active, builtIn: d.builtIn, suggestedFeature: d.suggestedFeature }))} />
    </div>
  );
}
