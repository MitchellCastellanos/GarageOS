import { redirect } from "next/navigation";
import { ADMIN } from "@/lib/routes";
import { createTireSet } from "@/actions/tire-storage";
import { getWorkOrderFormData } from "@/actions/work-orders";
import { getShopId } from "@/lib/shop-context";
import { canView } from "@/lib/subscription";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { TIRE_STORAGE_DICT } from "@/lib/admin-locale/tire-storage";
import { TireSetForm } from "@/components/tire-storage/TireSetForm";
import type { TireStorageFormData } from "@/lib/validations";

interface Props {
  searchParams: Promise<{ clientId?: string; vehicleId?: string }>;
}

export default async function NewTireSetPage({ searchParams }: Props) {
  const shopId = await getShopId();
  if (!(await canView(shopId, "tireStorage.manage"))) redirect(ADMIN.tireStorage);

  const [{ clients }, locale, sp] = await Promise.all([getWorkOrderFormData(), getAdminLocale(), searchParams]);
  const t = TIRE_STORAGE_DICT[locale];
  const client = clients.find((c) => c.id === sp.clientId);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">{t.form.titleNew}</h1>
      <TireSetForm
        mode="create"
        clients={clients}
        initial={{ clientId: client?.id ?? "", vehicleId: client?.vehicles.some((v) => v.id === sp.vehicleId) ? sp.vehicleId : "" }}
        onSubmit={async (data: TireStorageFormData) => {
          "use server";
          return createTireSet(data);
        }}
      />
    </div>
  );
}
