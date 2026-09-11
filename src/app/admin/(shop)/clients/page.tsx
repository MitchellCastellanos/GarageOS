import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import Link from "next/link";
import { getClients } from "@/actions/clients";
import { formatDate } from "@/lib/utils";
import { formatClientName } from "@/lib/client-name";
import { Users, Plus, Search, Car, FileText } from "lucide-react";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

// Esta es una Server Component — corre en el servidor, tiene acceso directo a la DB.
// Los searchParams (query string) llegan como prop sin necesidad de useSearchParams().
export default async function ClientsPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const clients = await getClients(q);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="text-slate-500 text-sm mt-1">
            {clients.length} cliente{clients.length !== 1 ? "s" : ""} registrado
            {clients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href={`${ADMIN.clients}/new`}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo cliente
        </Link>
      </div>

      {/* Búsqueda */}
      <SearchBar defaultValue={q} />

      {/* Lista o estado vacío */}
      {clients.length === 0 ? (
        <EmptyState hasSearch={!!q} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">
                  Cliente
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3 hidden sm:table-cell">
                  Contacto
                </th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">
                  Vehículos
                </th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">
                  Facturas
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3 hidden lg:table-cell">
                  Registrado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map((client) => (
                <tr
                  key={client.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-5 py-4">
                    <Link
                      href={`/clients/${client.id}`}
                      className="group"
                    >
                      <p className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                        {formatClientName(client)}
                      </p>
                    </Link>
                  </td>
                  <td className="px-5 py-4 hidden sm:table-cell">
                    <div className="text-sm text-slate-500 space-y-0.5">
                      {client.phone && <p>{client.phone}</p>}
                      {client.email && <p>{client.email}</p>}
                      {!client.email && !client.phone && (
                        <p className="text-slate-300">—</p>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex items-center justify-center gap-1 text-sm text-slate-600">
                      <Car className="w-3.5 h-3.5 text-slate-400" />
                      {client._count.vehicles}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-center hidden md:table-cell">
                    <div className="flex items-center justify-center gap-1 text-sm text-slate-600">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      {client._count.invoices}
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell">
                    <p className="text-sm text-slate-500">
                      {formatDate(client.createdAt)}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────

function SearchBar({ defaultValue }: { defaultValue?: string }) {
  return (
    <form method="GET" className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Buscar por nombre, email o teléfono..."
        className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </form>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  if (hasSearch) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">Sin resultados</p>
        <p className="text-slate-400 text-sm mt-1">
          Intenta con otro nombre, email o teléfono
        </p>
        <Link href={ADMIN.clients} className="mt-3 inline-block text-blue-600 hover:underline text-sm">
          Ver todos los clientes
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
      <p className="text-slate-500 font-medium">No hay clientes todavía</p>
      <p className="text-slate-400 text-sm mt-1">
        Registra tu primer cliente para comenzar
      </p>
      <Link
        href={`${ADMIN.clients}/new`}
        className="mt-4 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
        Agregar cliente
      </Link>
    </div>
  );
}
