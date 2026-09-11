import { ADMIN } from "@/lib/routes";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { getInvoices } from "@/actions/invoices";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatClientName } from "@/lib/client-name";
import {
  INVOICE_LIST_STATUS_TABS,
  INVOICE_STATUS_BADGE,
  INVOICE_STATUS_LABEL,
} from "@/lib/invoice-status";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function InvoicesPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const activeTab = status ?? "ALL";
  const invoices = await getInvoices(activeTab);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Facturas</h1>
          <p className="text-slate-500 text-sm mt-1">
            {invoices.length} factura{invoices.length !== 1 ? "s" : ""}
            {activeTab !== "ALL"
              ? ` · ${INVOICE_STATUS_LABEL[activeTab] ?? INVOICE_LIST_STATUS_TABS.find((t) => t.value === activeTab)?.label ?? activeTab}`
              : ""}
          </p>
        </div>
        <Link
          href={`${ADMIN.invoices}/new`}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva factura
        </Link>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {INVOICE_LIST_STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === "ALL" ? "/invoices" : `/invoices?status=${tab.value}`}
            className={[
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              activeTab === tab.value
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">
            {activeTab === "ALL"
              ? "No hay facturas todavía"
              : `No hay facturas en estado "${INVOICE_STATUS_LABEL[activeTab] ?? INVOICE_LIST_STATUS_TABS.find((t) => t.value === activeTab)?.label ?? activeTab}"`}
          </p>
          {activeTab === "ALL" && (
            <Link
              href={`${ADMIN.invoices}/new`}
              className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:underline text-sm"
            >
              <Plus className="w-4 h-4" />
              Crear primera factura
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_160px_120px_100px_110px] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 uppercase">
            <span>Factura / Cliente</span>
            <span>Vehículo</span>
            <span>Fecha</span>
            <span>Estado</span>
            <span className="text-right">Total</span>
          </div>

          <div className="divide-y divide-slate-100">
            {invoices.map((invoice) => (
              <Link
                key={invoice.id}
                href={`/invoices/${invoice.id}`}
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_160px_120px_100px_110px] gap-4 px-5 py-4 items-center hover:bg-slate-50 transition-colors"
              >
                {/* Invoice # + Client */}
                <div>
                  <p className="font-medium text-slate-900 text-sm">
                    {invoice.invoiceNumber}
                  </p>
                  <p className="text-slate-500 text-sm">
                    {formatClientName(invoice.client)}
                  </p>
                </div>

                {/* Vehicle(s) */}
                <div className="hidden sm:block">
                  {invoice.vehicles.map((iv) => (
                    <div key={iv.id} className="mb-1 last:mb-0">
                      <p className="text-sm text-slate-700">
                        {iv.vehicle.year} {iv.vehicle.make} {iv.vehicle.model}
                      </p>
                      <p className="text-xs text-slate-400">{iv.vehicle.licensePlate}</p>
                    </div>
                  ))}
                </div>

                {/* Date */}
                <div className="hidden sm:block text-sm text-slate-600">
                  {formatDate(invoice.issuedAt)}
                </div>

                {/* Status badge */}
                <div className="hidden sm:block">
                  <span
                className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${INVOICE_STATUS_BADGE[invoice.status] ?? "bg-slate-100 text-slate-500"}`}
              >
                {INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}
                  </span>
                </div>

                {/* Total */}
                <div className="text-right">
                  <p className="font-semibold text-slate-900 text-sm">
                    {formatCurrency(Number(invoice.total))}
                  </p>
                  {/* Mobile: status badge */}
                  <span className={`sm:hidden inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${INVOICE_STATUS_BADGE[invoice.status] ?? "bg-slate-100 text-slate-500"}`}>
                    {INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
