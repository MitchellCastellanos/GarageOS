"use client";

import { useTransition } from "react";
import { deleteVehicle } from "@/actions/vehicles";
import { Trash2 } from "lucide-react";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { CLIENTS_DICT } from "@/lib/admin-locale/clients";

interface Props {
  vehicleId: string;
  clientId: string;
  vehicleName: string;
}

export function DeleteVehicleButton({ vehicleId, clientId, vehicleName }: Props) {
  const locale = useAdminLocale();
  const t = CLIENTS_DICT[locale];
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(t.deleteVehicle.confirm(vehicleName))) {
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
      {isPending ? t.common.deleting : t.common.delete}
    </button>
  );
}
