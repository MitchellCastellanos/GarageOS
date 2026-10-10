import { InventoryPartForm } from "@/components/inventory/InventoryPartForm";
import { getInventoryPartById, updateInventoryPart } from "@/actions/inventory";
import type { InventoryPartFormData } from "@/lib/validations";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { INVENTORY_DICT } from "@/lib/admin-locale/inventory";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditInventoryPartPage({ params }: PageProps) {
  const { id } = await params;
  const locale = await getAdminLocale();
  const t = INVENTORY_DICT[locale];
  const part = await getInventoryPartById(id);

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t.form.titleEdit}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.form.subtitleEdit}</p>
      </div>

      <InventoryPartForm
        isEdit
        defaultValues={{
          name: part.name,
          sku: part.sku ?? "",
          description: part.description ?? "",
          unitCost: part.unitCost ? Number(part.unitCost) : undefined,
          unitPrice: Number(part.unitPrice),
          reorderThreshold: part.reorderThreshold,
        }}
        onSubmit={async (data: InventoryPartFormData) => {
          "use server";
          return updateInventoryPart(id, data);
        }}
      />
    </div>
  );
}
