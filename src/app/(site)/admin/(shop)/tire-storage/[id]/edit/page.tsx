import { adminPath } from "@/lib/routes";
import { getTireStorageSet, updateTireSet } from "@/actions/tire-storage";
import { getWorkOrderFormData } from "@/actions/work-orders";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { TIRE_STORAGE_DICT } from "@/lib/admin-locale/tire-storage";
import { TireSetForm } from "@/components/tire-storage/TireSetForm";
import type { TireStorageFormData } from "@/lib/validations";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditTireSetPage({ params }: Props) {
  const { id } = await params;
  const [set, { clients }, locale] = await Promise.all([getTireStorageSet(id), getWorkOrderFormData(), getAdminLocale()]);
  const t = TIRE_STORAGE_DICT[locale];

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">{t.form.titleEdit}</h1>
      <TireSetForm
        mode="edit"
        clients={clients}
        cancelHref={adminPath(`/tire-storage/${id}`)}
        initial={{
          clientId: set.clientId,
          vehicleId: set.vehicleId ?? "",
          season: set.season,
          brand: set.brand ?? "",
          model: set.model ?? "",
          size: set.size,
          quantity: set.quantity,
          condition: set.condition,
          withRims: set.withRims,
          storageLocation: set.storageLocation ?? "",
          expectedPickupDate: set.expectedPickupDate ? set.expectedPickupDate.toISOString().slice(0, 10) : "",
          notes: set.notes ?? "",
        }}
        onSubmit={async (data: TireStorageFormData) => {
          "use server";
          return updateTireSet(id, data);
        }}
      />
    </div>
  );
}
