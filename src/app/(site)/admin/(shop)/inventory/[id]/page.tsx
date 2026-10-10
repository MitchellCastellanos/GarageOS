import Link from "next/link";
import { ADMIN } from "@/lib/routes";
import { getInventoryPartById } from "@/actions/inventory";
import { formatCurrency, formatDate } from "@/lib/utils";
import { InventoryStockAdjustForm } from "@/components/inventory/InventoryStockAdjustForm";
import { InventoryDeleteButton } from "@/components/inventory/InventoryDeleteButton";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { INVENTORY_DICT } from "@/lib/admin-locale/inventory";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InventoryPartDetailPage({ params }: PageProps) {
  const { id } = await params;
  const locale = await getAdminLocale();
  const t = INVENTORY_DICT[locale];
  const part = await getInventoryPartById(id);
  const lowStock = part.quantityOnHand <= part.reorderThreshold;

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href={ADMIN.inventory} className="text-sm text-blue-600 hover:underline">
        {t.detail.backToList}
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{part.name}</h1>
          {part.sku && <p className="text-slate-500 text-sm mt-1">SKU: {part.sku}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`${ADMIN.inventory}/${part.id}/edit`}
            className="border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            {t.detail.editButton}
          </Link>
          <InventoryDeleteButton partId={part.id} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-1">{t.detail.stockHeading}</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold text-slate-900">{part.quantityOnHand}</p>
            {lowStock && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                {t.table.lowStockBadge}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {t.detail.reorderLabel} {part.reorderThreshold}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-1">{t.detail.priceLabel}</p>
          <p className="text-2xl font-bold text-slate-900">
            {formatCurrency(Number(part.unitPrice))}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-1">{t.detail.costLabel}</p>
          <p className="text-2xl font-bold text-slate-900">
            {part.unitCost != null ? formatCurrency(Number(part.unitCost)) : "—"}
          </p>
        </div>
      </div>

      {part.description && (
        <p className="text-sm text-slate-600 bg-white rounded-xl border border-slate-200 p-4">
          {part.description}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">{t.detail.adjustStockHeading}</h2>
          <InventoryStockAdjustForm partId={part.id} />
        </div>

        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">{t.detail.historyHeading}</h2>
          </div>
          {part.movements.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              {t.detail.historyEmpty}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {part.movements.map((movement) => (
                <div key={movement.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {t.detail.movementTypes[movement.type]}
                    </p>
                    <p className="text-xs text-slate-400">{formatDate(movement.createdAt)}</p>
                    {movement.note && (
                      <p className="text-xs text-slate-400 italic truncate">{movement.note}</p>
                    )}
                  </div>
                  <p
                    className={`text-sm font-semibold flex-shrink-0 ${movement.quantity >= 0 ? "text-emerald-600" : "text-red-500"}`}
                  >
                    {movement.quantity >= 0 ? "+" : ""}
                    {movement.quantity}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
