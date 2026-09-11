"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  CASH_DRAWER_ENTRY_TYPES,
  cashDrawerEntryTypeLabel,
} from "@/lib/cash-drawer";
import {
  createCashDrawerEntry,
  deleteCashDrawerEntry,
} from "@/actions/cash-drawer";
import type { CashDrawerEntryFormData } from "@/lib/validations";
import { ADMIN } from "@/lib/routes";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";

type SerializedEntry = {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  occurredAt: string;
  linkedInvoice: { id: string; invoiceNumber: string } | null;
};

type Summary = {
  openingBalance: number;
  cashIn: number;
  cashOut: number;
  adjustments: number;
  expectedBalance: number;
};

interface CashDrawerClientProps {
  entries: SerializedEntry[];
  summary: Summary;
  date: string;
}

const MANUAL_TYPES = CASH_DRAWER_ENTRY_TYPES.filter(
  (t) => t.value !== "CASH_IN"
);

export function CashDrawerClient({
  entries: initialEntries,
  summary,
  date,
}: CashDrawerClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CashDrawerEntryFormData>({
    type: "CASH_OUT",
    amount: 0,
    description: "",
    occurredAt: `${date}T12:00`,
    linkedInvoiceId: "",
  });

  const summaryCards = [
    { label: "Apertura hoy", value: summary.openingBalance },
    { label: "Efectivo recibido", value: summary.cashIn },
    { label: "Efectivo pagado", value: summary.cashOut },
    { label: "Ajustes", value: summary.adjustments },
    { label: "Saldo esperado en caja", value: summary.expectedBalance, highlight: true },
  ];

  function updateForm<K extends keyof CashDrawerEntryFormData>(
    key: K,
    value: CashDrawerEntryFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createCashDrawerEntry(form);
      if (result.error) {
        const first = Object.values(result.error).flat()[0];
        setError(first ?? "No se pudo guardar el movimiento");
        return;
      }
      setForm({
        type: "CASH_OUT",
        amount: 0,
        description: "",
        occurredAt: `${date}T12:00`,
        linkedInvoiceId: "",
      });
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("¿Eliminar este movimiento manual?")) return;
    startTransition(async () => {
      const result = await deleteCashDrawerEntry(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Fecha
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => router.push(`${ADMIN.caja}?date=${e.target.value}`)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className={`bg-white rounded-xl border p-4 ${
              card.highlight
                ? "border-emerald-200 bg-emerald-50/40"
                : "border-slate-200"
            }`}
          >
            <p className="text-xs text-slate-500">{card.label}</p>
            <p
              className={`text-xl font-bold mt-1 ${
                card.highlight ? "text-emerald-700" : "text-slate-900"
              }`}
            >
              {formatCurrency(card.value)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 lg:col-span-1"
        >
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Nuevo movimiento
          </h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Tipo
            </label>
            <select
              value={form.type}
              onChange={(e) =>
                updateForm("type", e.target.value as CashDrawerEntryFormData["type"])
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              {MANUAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Monto
            </label>
            <input
              type="number"
              step="0.01"
              value={form.amount || ""}
              onChange={(e) => updateForm("amount", Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="0.00"
            />
            {form.type === "ADJUSTMENT" && (
              <p className="text-xs text-slate-500 mt-1">
                Usa valores negativos para reducir el saldo.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Fecha y hora
            </label>
            <input
              type="datetime-local"
              value={form.occurredAt}
              onChange={(e) => updateForm("occurredAt", e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Nota (opcional)
            </label>
            <textarea
              value={form.description}
              onChange={(e) => updateForm("description", e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="Ej. compra de repuestos en efectivo"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "Guardando..." : "Registrar movimiento"}
          </button>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 lg:col-span-2 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Movimientos del día</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Las entradas por cobros en efectivo se crean al marcar facturas como pagadas.
            </p>
          </div>

          {initialEntries.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">
              Sin movimientos para esta fecha
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <th className="px-5 py-2 font-medium">Hora</th>
                    <th className="px-5 py-2 font-medium">Tipo</th>
                    <th className="px-5 py-2 font-medium text-right">Monto</th>
                    <th className="px-5 py-2 font-medium">Nota / Factura</th>
                    <th className="px-5 py-2 font-medium w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {initialEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/80">
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                        {formatDate(new Date(entry.occurredAt))}
                      </td>
                      <td className="px-5 py-3 text-slate-900">
                        {cashDrawerEntryTypeLabel(
                          entry.type as (typeof CASH_DRAWER_ENTRY_TYPES)[number]["value"]
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-slate-900">
                        {formatCurrency(entry.amount)}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {entry.linkedInvoice ? (
                          <Link
                            href={`${ADMIN.invoices}/${entry.linkedInvoice.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {entry.linkedInvoice.invoiceNumber}
                          </Link>
                        ) : (
                          entry.description ?? "—"
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {!entry.linkedInvoice && (
                          <button
                            type="button"
                            onClick={() => handleDelete(entry.id)}
                            disabled={isPending}
                            className="text-slate-400 hover:text-red-500"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
