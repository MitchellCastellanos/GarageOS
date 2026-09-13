import { InventoryPartForm } from "@/components/inventory/InventoryPartForm";
import { createInventoryPart } from "@/actions/inventory";
import type { InventoryPartFormData } from "@/lib/validations";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { INVENTORY_DICT } from "@/lib/admin-locale/inventory";

export default async function NewInventoryPartPage() {
  const locale = await getAdminLocale();
  const t = INVENTORY_DICT[locale];

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t.form.titleNew}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.form.subtitleNew}</p>
      </div>

      <InventoryPartForm
        onSubmit={async (data: InventoryPartFormData) => {
          "use server";
          return createInventoryPart(data);
        }}
      />
    </div>
  );
}
