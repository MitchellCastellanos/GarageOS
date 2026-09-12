import { getVehicleById, updateVehicle } from "@/actions/vehicles";
import { adminPath } from "@/lib/routes";
import { VehicleForm } from "@/components/clients/VehicleForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { CLIENTS_DICT } from "@/lib/admin-locale/clients";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditVehiclePage({ params }: Props) {
  const { id } = await params;
  const [vehicle, locale] = await Promise.all([getVehicleById(id), getAdminLocale()]);
  const t = CLIENTS_DICT[locale];

  const defaultValues = {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    licensePlate: vehicle.licensePlate,
    vin: vehicle.vin ?? "",
    color: vehicle.color ?? "",
    mileageUnit: vehicle.mileageUnit as "KM" | "MILES",
  };

  return (
    <div className="max-w-2xl">
      <Link
        href={adminPath(`/vehicles/${id}`)}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        {vehicle.year} {vehicle.make} {vehicle.model}
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">{t.vehicleEdit.title}</h1>
      <p className="text-slate-500 text-sm mb-6">
        {t.vehicleEdit.subtitle(`${vehicle.year} ${vehicle.make} ${vehicle.model}`)}
      </p>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <VehicleForm
          clientId={vehicle.clientId}
          defaultValues={defaultValues}
          onSubmit={updateVehicle.bind(null, id)}
          submitLabel={t.common.saveChanges}
        />
      </div>
    </div>
  );
}
