import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import { getClientById } from "@/actions/clients";
import { deleteClient } from "@/actions/clients";
import { formatDate, formatCurrency } from "@/lib/utils";
import { formatClientName } from "@/lib/client-name";
import { INVOICE_STATUS_BADGE, INVOICE_STATUS_LABEL } from "@/lib/invoice-status";
import Link from "next/link";
import {
  ChevronLeft,
  Pencil,
  Trash2,
  Car,
  Plus,
  Phone,
  Mail,
  MapPin,
  Globe,
  FileText,
} from "lucide-react";
import { INVOICE_LANGUAGES } from "@/lib/invoice-i18n";
import { DeleteButton } from "@/components/clients/DeleteButton";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params;
  const client = await getClientById(id);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb + Acciones */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href={ADMIN.clients}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-2 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Clientes
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">
            {formatClientName(client)}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Cliente desde {formatDate(client.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/clients/${id}/edit`}
            className="flex items-center gap-1.5 border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Editar
          </Link>
          <DeleteButton clientId={id} clientName={formatClientName(client)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Información del cliente */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Información</h2>
            <div className="space-y-3">
              {client.phone && (
                <ContactRow icon={<Phone className="w-4 h-4 text-slate-400" />}>
                  <a href={`tel:${client.phone}`} className="text-sm text-slate-700">
                    {client.phone}
                  </a>
                </ContactRow>
              )}
              {client.email && (
                <ContactRow icon={<Mail className="w-4 h-4 text-slate-400" />}>
                  <a href={`mailto:${client.email}`} className="text-blue-600 hover:underline text-sm">
                    {client.email}
                  </a>
                </ContactRow>
              )}
              {client.address && (
                <ContactRow icon={<MapPin className="w-4 h-4 text-slate-400" />}>
                  <p className="text-sm text-slate-700">{client.address}</p>
                </ContactRow>
              )}
              <ContactRow icon={<Globe className="w-4 h-4 text-slate-400" />}>
                <p className="text-sm text-slate-700">
                  {INVOICE_LANGUAGES.find((l) => l.value === client.language)?.label ??
                    client.language}{" "}
                  <span className="text-slate-400">— SMS y email</span>
                </p>
              </ContactRow>
              {!client.email && !client.phone && !client.address && (
                <p className="text-sm text-slate-400">Sin información de contacto</p>
              )}
            </div>
            {client.notes && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 uppercase mb-1.5">Notas</p>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{client.notes}</p>
              </div>
            )}
          </div>

          {/* Stats rápidos */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Vehículos" value={client._count.vehicles} icon={<Car className="w-4 h-4 text-blue-600" />} />
            <StatCard label="Facturas" value={client._count.invoices} icon={<FileText className="w-4 h-4 text-violet-600" />} />
          </div>
        </div>

        {/* Vehículos + Facturas recientes */}
        <div className="lg:col-span-2 space-y-4">
          {/* Vehículos */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Car className="w-4 h-4 text-slate-400" />
                <h2 className="font-semibold text-slate-900">Vehículos</h2>
              </div>
              <Link
                href={`/clients/${id}/vehicles/new`}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar
              </Link>
            </div>

            {client.vehicles.length === 0 ? (
              <div className="p-6 text-center">
                <Car className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Sin vehículos registrados</p>
                <Link
                  href={`/clients/${id}/vehicles/new`}
                  className="mt-2 inline-block text-sm text-blue-600 hover:underline"
                >
                  Agregar vehículo →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {client.vehicles.map((vehicle) => (
                  <Link
                    key={vehicle.id}
                    href={`/vehicles/${vehicle.id}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Placa: {vehicle.licensePlate}
                        {vehicle.color ? ` · ${vehicle.color}` : ""}
                      </p>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-slate-400 rotate-180" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Últimas facturas */}
          {client.invoices.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <h2 className="font-semibold text-slate-900">Últimas facturas</h2>
                </div>
                <Link href={ADMIN.invoices} className="text-xs text-blue-600 hover:underline">
                  Ver todas →
                </Link>
              </div>
              <div className="divide-y divide-slate-100">
                {client.invoices.map((invoice) => (
                  <Link
                    key={invoice.id}
                    href={`/invoices/${invoice.id}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {invoice.invoiceNumber}
                      </p>
                      <p className="text-xs text-slate-500">
                        {invoice.vehicles
                          .map((iv) => `${iv.vehicle.make} ${iv.vehicle.model}`)
                          .join(", ")}{" "}
                        · {formatDate(invoice.issuedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-900">
                        {formatCurrency(Number(invoice.total))}
                      </p>
                      <StatusBadge status={invoice.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────

function ContactRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      {children}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-1">{icon}<p className="text-xs text-slate-500">{label}</p></div>
      <p className="text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${INVOICE_STATUS_BADGE[status] ?? "bg-slate-100 text-slate-500"}`}
    >
      {INVOICE_STATUS_LABEL[status] ?? status}
    </span>
  );
}
