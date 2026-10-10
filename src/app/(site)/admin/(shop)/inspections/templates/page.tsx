import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ADMIN } from "@/lib/routes";
import { getInspectionTemplates } from "@/actions/inspection-templates";
import { getShopId } from "@/lib/shop-context";
import { canView } from "@/lib/subscription";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { INSPECTIONS_ADVANCED_DICT } from "@/lib/admin-locale/inspections-advanced";
import { TemplateManager } from "@/components/inspections/TemplateManager";
import { UpgradeCTA } from "@/components/billing/UpgradeCTA";

export default async function InspectionTemplatesPage() {
  const locale = await getAdminLocale();
  const t = INSPECTIONS_ADVANCED_DICT[locale].templates;
  const shopId = await getShopId();
  const entitled = await canView(shopId, "dvi.templates");
  const templates = entitled ? await getInspectionTemplates() : [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={ADMIN.inspections} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-2">
          <ArrowLeft className="w-4 h-4" />
          {t.back}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.subtitle}</p>
      </div>
      {entitled ? (
        <TemplateManager templates={templates.map((x) => ({ id: x.id, name: x.name, items: x.items }))} />
      ) : (
        <UpgradeCTA requiredPlan="PRO" title={t.locked.title} description={t.locked.description} ctaLabel={t.locked.cta} />
      )}
    </div>
  );
}
