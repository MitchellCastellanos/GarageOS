import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import Link from "next/link";
import { getClients } from "@/actions/clients";
import { formatDate } from "@/lib/utils";
import { formatClientName } from "@/lib/client-name";
import { Users, Plus, Search, Car, FileText } from "lucide-react";
import { getAdminLocale } from "@/lib/admin-locale";
import { CLIENTS_DICT, type ClientsDictionary } from "@/lib/admin-locale/clients";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

// Esta es una Server Component — corre en el servidor, tiene acceso directo a la DB.
// Los searchParams (query string) llegan como prop sin necesidad de useSearchParams().
export default async function ClientsPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const [clients, locale] = await Promise.all([getClients(q), getAdminLocale()]);
  const t = CLIENTS_DICT[locale];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.list.title}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.list.count(clients.length)}</p>
        </div>
        <Link
          href={`${ADMIN.clients}/new`}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t.list.newClient}
        </Link>
      </div>

      {/* Búsqueda */}
      <SearchBar defaultValue={q} t={t} />

      {/* Lista o estado vacío */}
      {clients.length === 0 ? (
        <EmptyState hasSearch={!!q} t={t} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">
                  {t.list.tableClient}
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3 hidden sm:table-cell">
                  {t.list.tableContact}
                </th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">
                  {t.list.tableVehicles}
                </th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">
                  {t.list.tableInvoices}
                </th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3 hidden lg:table-cell">
                  {t.list.tableRegistered}
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
                      href={adminPath(`/clients/${client.id}`)}
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

function SearchBar({ defaultValue, t }: { defaultValue?: string; t: ClientsDictionary }) {
  return (
    <form method="GET" className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder={t.list.searchPlaceholder}
        className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </form>
  );
}

function EmptyState({ hasSearch, t }: { hasSearch: boolean; t: ClientsDictionary }) {
  if (hasSearch) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">{t.list.emptySearchTitle}</p>
        <p className="text-slate-400 text-sm mt-1">{t.list.emptySearchBody}</p>
        <Link href={ADMIN.clients} className="mt-3 inline-block text-blue-600 hover:underline text-sm">
          {t.list.viewAll}
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
      <p className="text-slate-500 font-medium">{t.list.emptyTitle}</p>
      <p className="text-slate-400 text-sm mt-1">{t.list.emptyBody}</p>
      <Link
        href={`${ADMIN.clients}/new`}
        className="mt-4 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
        {t.list.addClient}
      </Link>
    </div>
  );
}
