import { ADMIN } from "@/lib/routes";
import Link from "next/link";
import { Package, Plus, AlertTriangle } from "lucide-react";
import { getInventoryParts } from "@/actions/inventory";
import { formatCurrency } from "@/lib/utils";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { INVENTORY_DICT } from "@/lib/admin-locale/inventory";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function InventoryPage({ searchParams }: Props) {
  const locale = await getAdminLocale();
  const t = INVENTORY_DICT[locale];
  const { q } = await searchParams;
  const parts = await getInventoryParts(q);
  const lowStockCount = parts.filter((p) => p.quantityOnHand <= p.reorderThreshold).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.page.title}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.page.countLabel(parts.length)}</p>
        </div>
        <Link
          href={`${ADMIN.inventory}/new`}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t.page.newPart}
        </Link>
      </div>

      {lowStockCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">{t.page.lowStockBanner(lowStockCount)}</p>
        </div>
      )}

      <form action={ADMIN.inventory} method="GET">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder={t.page.searchPlaceholder}
          className="w-full max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </form>

      {parts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">{t.table.emptyTitle}</p>
          <Link
            href={`${ADMIN.inventory}/new`}
            className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:underline text-sm"
          >
            <Plus className="w-4 h-4" />
            {t.table.emptyCta}
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">
                  {t.table.colName}
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">
                  {t.table.colSku}
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">
                  {t.table.colStock}
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">
                  {t.table.colPrice}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {parts.map((part) => {
                const lowStock = part.quantityOnHand <= part.reorderThreshold;
                return (
                  <tr key={part.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`${ADMIN.inventory}/${part.id}`}
                        className="font-medium text-slate-900 text-sm hover:text-blue-600"
                      >
                        {part.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-500">
                      {part.sku || t.table.noSku}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {part.quantityOnHand}
                        </span>
                        {lowStock && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            {t.table.lowStockBadge}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-900">
                      {formatCurrency(Number(part.unitPrice))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
