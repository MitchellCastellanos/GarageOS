import { requirePagePermission } from "@/lib/access";
import { getShopId } from "@/lib/shop-context";
import { canView } from "@/lib/subscription";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { IMPORT_DICT } from "@/lib/admin-locale/import";
import { getRecentImportRuns } from "@/actions/import";
import { ImportWizard } from "@/components/import/ImportWizard";
import { IMPORT_LIMITS } from "@/domain/import";

export default async function ImportPage() {
  // `import.run`: dueño por defecto, delegable en Pro+ (enforcement también en las server actions).
  await requirePagePermission("import.run");

  const locale = await getAdminLocale();
  const t = IMPORT_DICT[locale];
  const shopId = await getShopId();
  const [full, runs] = await Promise.all([canView(shopId, "import.full"), getRecentImportRuns()]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.subtitle}</p>
      </div>
      <ImportWizard
        fullImport={full}
        basicMaxRows={IMPORT_LIMITS.basicMaxRows}
        recentRuns={runs.map((r) => ({
          id: r.id,
          entity: r.entity,
          fileName: r.fileName,
          created: r.created,
          updated: r.updated,
          skipped: r.skipped,
          errors: r.errors,
          createdAt: r.createdAt.toISOString(),
        }))}
        locale={locale}
      />
    </div>
  );
}
