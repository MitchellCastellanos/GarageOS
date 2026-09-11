"use client";

import { useTransition } from "react";
import { deleteVehicle } from "@/actions/vehicles";
import { Trash2 } from "lucide-react";

interface Props {
  vehicleId: string;
  clientId: string;
  vehicleName: string;
}

export function DeleteVehicleButton({ vehicleId, clientId, vehicleName }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`¿Eliminar ${vehicleName}? Se eliminará el historial de servicio del vehículo.`)) {
      return;
    }
    startTransition(() => deleteVehicle(vehicleId, clientId));
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="flex items-center gap-1.5 border border-red-200 hover:border-red-400 text-red-600 hover:text-red-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
    >
      <Trash2 className="w-3.5 h-3.5" />
      {isPending ? "Eliminando..." : "Eliminar"}
    </button>
  );
}
