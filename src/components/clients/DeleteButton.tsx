"use client";

import { useTransition } from "react";
import { deleteClient } from "@/actions/clients";
import { Trash2 } from "lucide-react";

interface Props {
  clientId: string;
  clientName: string;
}

export function DeleteButton({ clientId, clientName }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`¿Eliminar a ${clientName} y todos sus vehículos e historial? Esta acción no se puede deshacer.`)) {
      return;
    }
    startTransition(() => deleteClient(clientId));
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
