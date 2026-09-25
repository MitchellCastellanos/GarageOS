"use client";

import { useState, useTransition } from "react";
import { Download, FileText, Search } from "lucide-react";
import { getInvoiceHistory, type InvoiceHistoryEntry } from "@/actions/documents";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ADMIN } from "@/lib/routes";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { CAJA_DICT } from "@/lib/admin-locale/caja";

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function InvoiceHistoryPanel() {
  const locale = useAdminLocale();
  const t = CAJA_DICT[locale].invoiceHistory;
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [entries, setEntries] = useState<InvoiceHistoryEntry[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSearch() {
    startTransition(async () => {
      const result = await getInvoiceHistory({ from, to });
      setEntries(result);
    });
  }

  const total = entries?.reduce((sum, e) => sum + Number(e.total), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">{t.fromLabel}</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={to}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">{t.toLabel}</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              min={from}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Search className="w-4 h-4" />
            {isPending ? t.searching : t.search}
          </button>
          {entries && entries.length > 0 && (
            <a
              href={`/api/invoices/export?from=${from}&to=${to}`}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              {t.downloadCsv}
            </a>
          )}
        </div>
      </div>

      {entries && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">
              {t.resultsTitle}
              <span className="ml-2 text-sm font-normal text-slate-400">({entries.length})</span>
            </h2>
            {entries.length > 0 && (
              <span className="text-sm font-semibold text-slate-900">{formatCurrency(total)}</span>
            )}
          </div>

          {entries.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">{t.empty}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <a
                  key={entry.id}
                  href={`${ADMIN.invoices}/${entry.id}`}
                  className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900 font-medium truncate">
                      {entry.invoiceNumber} · {entry.clientName}
                    </p>
                    <p className="text-xs text-slate-400">{formatDate(entry.paidAt)}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-900 flex-shrink-0">
                    {formatCurrency(Number(entry.total))}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
