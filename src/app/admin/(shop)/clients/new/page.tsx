import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import { ClientForm } from "@/components/clients/ClientForm";
import { createClient } from "@/actions/clients";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export default function NewClientPage() {
  return (
    <div className="max-w-2xl">
      {/* Breadcrumb */}
      <Link
        href={ADMIN.clients}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Clientes
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Nuevo cliente</h1>
      <p className="text-slate-500 text-sm mb-6">
        Registra los datos del cliente. Los campos marcados con * son requeridos.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <ClientForm onSubmit={createClient} />
      </div>
    </div>
  );
}
