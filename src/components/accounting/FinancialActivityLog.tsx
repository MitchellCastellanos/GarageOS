"use client";

import { useState, useTransition } from "react";
import { getFinancialActivityAction } from "@/actions/accounting";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { ACCOUNTING_DICT } from "@/lib/admin-locale/accounting";
import { formatCurrency } from "@/lib/utils";
import type { ActivityRow } from "@/lib/accounting-service";

export function FinancialActivityLog({ initial, nextCursor }: { initial: ActivityRow[]; nextCursor: string | null }) {
  const t = ACCOUNTING_DICT[useAdminLocale()];
  const [rows, setRows] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [pending, start] = useTransition();

  function more() {
    start(async () => {
      const res = await getFinancialActivityAction(cursor);
      if ("error" in res) return;
      setRows((r) => [...r, ...res.rows]);
      setCursor(res.nextCursor);
    });
  }

  if (rows.length === 0) return <p className="text-sm text-slate-400">{t.activity.empty}</p>;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="py-2 pr-3 font-medium">{t.activity.when}</th>
              <th className="py-2 pr-3 font-medium">{t.activity.event}</th>
              <th className="py-2 pr-3 font-medium">{t.activity.invoice}</th>
              <th className="py-2 pr-3 font-medium text-right">{t.activity.amount}</th>
              <th className="py-2 font-medium">{t.activity.by}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.at).toLocaleString()}</td>
                <td className="py-2 pr-3">{t.events[r.type] ?? r.type}</td>
                <td className="py-2 pr-3">{r.invoiceNumber ?? "—"}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.amount == null ? "—" : formatCurrency(r.amount)}</td>
                <td className="py-2">{r.actor ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cursor && (
        <button type="button" disabled={pending} onClick={more} className="px-3 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50">
          {t.activity.more}
        </button>
      )}
    </div>
  );
}
