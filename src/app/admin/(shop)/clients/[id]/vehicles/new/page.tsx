import { getClientById } from "@/actions/clients";
import { formatClientName } from "@/lib/client-name";
import { createVehicle } from "@/actions/vehicles";
import { VehicleForm } from "@/components/clients/VehicleForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NewVehiclePage({ params }: Props) {
  const { id } = await params;
  const client = await getClientById(id);

  return (
    <div className="max-w-2xl">
      <Link
        href={`/clients/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        {formatClientName(client)}
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Nuevo vehículo</h1>
      <p className="text-slate-500 text-sm mb-6">
        Registra un vehículo para {formatClientName(client)}.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <VehicleForm
          clientId={id}
          onSubmit={createVehicle.bind(null, id)}
        />
      </div>
    </div>
  );
}
