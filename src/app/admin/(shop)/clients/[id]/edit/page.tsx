import { getClientById, updateClient } from "@/actions/clients";
import { ClientForm } from "@/components/clients/ClientForm";
import { formatClientName } from "@/lib/client-name";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditClientPage({ params }: Props) {
  const { id } = await params;
  const client = await getClientById(id);

  // Preparamos los valores iniciales del formulario desde la DB
  const defaultValues = {
    firstName: client.firstName,
    lastName: client.lastName ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    language: client.language,
    address: client.address ?? "",
    notes: client.notes ?? "",
  };

  return (
    <div className="max-w-2xl">
      <Link
        href={`/clients/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        {formatClientName(client)}
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Editar cliente</h1>
      <p className="text-slate-500 text-sm mb-6">
        Actualiza los datos de {formatClientName(client)}.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        {/* updateClient necesita el id — usamos bind para pasarlo */}
        <ClientForm
          defaultValues={defaultValues}
          onSubmit={updateClient.bind(null, id)}
          submitLabel="Guardar cambios"
        />
      </div>
    </div>
  );
}
