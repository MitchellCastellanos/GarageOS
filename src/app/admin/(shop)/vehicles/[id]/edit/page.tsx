import { getVehicleById, updateVehicle } from "@/actions/vehicles";
import { VehicleForm } from "@/components/clients/VehicleForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditVehiclePage({ params }: Props) {
  const { id } = await params;
  const vehicle = await getVehicleById(id);

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
        href={`/vehicles/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        {vehicle.year} {vehicle.make} {vehicle.model}
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Editar vehículo</h1>
      <p className="text-slate-500 text-sm mb-6">
        Actualiza los datos de {vehicle.year} {vehicle.make} {vehicle.model}.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <VehicleForm
          clientId={vehicle.clientId}
          defaultValues={defaultValues}
          onSubmit={updateVehicle.bind(null, id)}
          submitLabel="Guardar cambios"
        />
      </div>
    </div>
  );
}
