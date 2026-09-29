"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  disconnectQuickBooksAction,
  getQuickBooksOptions,
  retryFailedQuickBooksSync,
  saveQuickBooksSettings,
  syncQuickBooksNow,
  type QuickBooksOptions,
  type QuickBooksOverview,
} from "@/actions/quickbooks";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { QUICKBOOKS_DICT } from "@/lib/admin-locale/quickbooks";
import { UpgradeCTA } from "@/components/billing/UpgradeCTA";

const field = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white";
const btn = "px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50";

export function QuickBooksCard({ overview, notice }: { overview: QuickBooksOverview; notice?: string | null }) {
  const t = QUICKBOOKS_DICT[useAdminLocale()];
  const router = useRouter();
  const [pending, start] = useTransition();
  const [options, setOptions] = useState<QuickBooksOptions | null>(null);
  const conn = overview.connection;
  const [form, setForm] = useState({
    incomeAccountId: conn?.settings.incomeAccountId ?? "",
    depositAccountId: conn?.settings.depositAccountId ?? "",
    taxCodeId: conn?.settings.taxCodeId ?? "",
    zeroTaxCodeId: conn?.settings.zeroTaxCodeId ?? "",
    syncStartDate: conn?.syncStartDate ?? "",
  });

  const active = conn?.status === "ACTIVE";
  const noticeText = notice ? t.notices[notice] : null;

  function reportSync(res: Awaited<ReturnType<typeof syncQuickBooksNow>>): void {
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    if (res.status !== "OK") {
      toast.error(t.sync.skipped[res.reason ?? "ERROR"] ?? res.reason ?? "");
      return;
    }
    const errors = res.invoices.errors + res.payments.errors + res.refunds.errors;
    const s = { synced: res.invoices.synced + res.payments.synced + res.refunds.synced, errors, remaining: res.remaining };
    if (errors) toast.warning(t.sync.result(s));
    else toast.success(t.sync.result(s));
    router.refresh();
  }

  function loadOptions() {
    start(async () => {
      const res = await getQuickBooksOptions();
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setOptions(res);
    });
  }

  const select = (label: string, key: keyof typeof form, list: { id: string; name: string }[] | undefined) => (
    <label className="block text-xs font-medium text-slate-600 space-y-1">
      <span>{label}</span>
      <select className={field} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}>
        <option value="">{t.mapping.none}</option>
        {/* Valor ya guardado aunque las opciones aún no se hayan cargado */}
        {form[key] && !list?.some((o) => o.id === form[key]) && <option value={form[key]}>{form[key]}</option>}
        {list?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t.title}</h2>
        <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        <ul className="text-xs text-slate-500 mt-2 flex flex-wrap gap-x-4 gap-y-1 list-disc list-inside">{t.what.map((w) => <li key={w}>{w}</li>)}</ul>
      </div>

      {noticeText && <p role="status" className="text-sm rounded-lg border border-blue-200 bg-blue-50 text-blue-900 px-3 py-2">{noticeText}</p>}

      {!overview.entitled ? (
        <UpgradeCTA requiredPlan="PRO" title={t.locked.title} description={t.locked.description} ctaLabel={t.locked.cta} compact />
      ) : !overview.configured ? (
        <p className="text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">{t.notConfigured}</p>
      ) : !conn || conn.status === "DISCONNECTED" ? (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <p className="text-sm text-slate-600">{t.notConnected}</p>
          {overview.canOperate && <a href="/api/integrations/quickbooks/connect" className={`${btn} inline-block bg-emerald-600 text-white hover:bg-emerald-700`}>{t.connect}</a>}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-slate-500">{t.status.company}</dt><dd className="font-medium">{conn.companyName ?? conn.realmId}</dd></div>
              <div><dt className="text-xs text-slate-500">{t.status.environment}</dt><dd className="font-medium capitalize">{conn.environment}</dd></div>
              <div><dt className="text-xs text-slate-500">{t.status.connectedOn}</dt><dd>{new Date(conn.connectedAt).toLocaleDateString()}</dd></div>
              <div><dt className="text-xs text-slate-500">{t.status.lastSync}</dt><dd>{conn.lastSyncAt ? new Date(conn.lastSyncAt).toLocaleString() : t.status.never}</dd></div>
            </dl>
            {conn.environment === "sandbox" && <p className="text-xs text-amber-700">{t.status.sandboxNote}</p>}
            {conn.status === "NEEDS_RECONNECT" && (
              <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2 flex items-center justify-between gap-3">
                <span>{t.needsReconnect}</span>
                {overview.canOperate && <a href="/api/integrations/quickbooks/connect" className={`${btn} bg-red-600 text-white hover:bg-red-700 whitespace-nowrap`}>{t.reconnect}</a>}
              </div>
            )}
            {conn.lastError && conn.status === "ACTIVE" && <p className="text-xs text-red-600">{conn.lastError}</p>}
            <div className="grid grid-cols-3 gap-3 text-center">
              {([["synced", overview.counts.synced], ["errors", overview.counts.errors], ["pending", overview.counts.pending]] as const).map(([k, n]) => (
                <div key={k} className="rounded-lg bg-slate-50 py-2"><p className="text-lg font-bold text-slate-900">{n}</p><p className="text-xs text-slate-500">{t.counts[k]}</p></div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {active && overview.canOperate && (
                <>
                  <button type="button" disabled={pending} onClick={() => start(async () => { reportSync(await syncQuickBooksNow()); })} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
                    {pending ? <Loader2 className="w-4 h-4 animate-spin inline" /> : null} {pending ? t.sync.syncing : t.sync.now}
                  </button>
                  {overview.counts.errors > 0 && <button type="button" disabled={pending} onClick={() => start(async () => { reportSync(await retryFailedQuickBooksSync()); })} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>{t.sync.retry}</button>}
                </>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!confirm(t.disconnectConfirm)) return;
                  start(async () => {
                    const res = await disconnectQuickBooksAction();
                    if ("error" in res) toast.error(res.error);
                    router.refresh();
                  });
                }}
                className={`${btn} border border-red-200 text-red-700 hover:bg-red-50`}
              >
                {t.disconnect}
              </button>
            </div>
          </div>

          {active && overview.canOperate && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">{t.mapping.title}</h3>
              <p className="text-xs text-slate-500">{t.mapping.hint}</p>
              <button type="button" disabled={pending} onClick={loadOptions} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>{pending ? t.mapping.loading : t.mapping.load}</button>
              {select(t.mapping.income, "incomeAccountId", options?.incomeAccounts)}
              {select(t.mapping.deposit, "depositAccountId", options?.bankAccounts)}
              {select(t.mapping.taxCode, "taxCodeId", options?.taxCodes)}
              {select(t.mapping.zeroTaxCode, "zeroTaxCodeId", options?.taxCodes)}
              {!form.taxCodeId && <p className="text-xs text-amber-700">{t.mapping.taxRequired}</p>}
              <label className="block text-xs font-medium text-slate-600 space-y-1">
                <span>{t.mapping.startDate}</span>
                <input type="date" className={field} value={form.syncStartDate} onChange={(e) => setForm((f) => ({ ...f, syncStartDate: e.target.value }))} />
                <span className="block text-slate-400 font-normal">{t.mapping.startDateHint}</span>
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => {
                  const res = await saveQuickBooksSettings(form);
                  if ("error" in res && res.error) toast.error(res.error);
                  else { toast.success(t.mapping.saved); router.refresh(); }
                })}
                className={`${btn} bg-slate-900 text-white hover:bg-slate-800`}
              >
                {t.mapping.save}
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">{t.problems.title}</h3>
            {overview.problems.length === 0 ? <p className="text-sm text-slate-400">{t.problems.empty}</p> : (
              <ul className="space-y-2">
                {overview.problems.map((p) => (
                  <li key={p.id} className="text-sm border-b border-slate-50 pb-2 last:border-0">
                    <p className="font-medium text-slate-800">{t.problems.type[p.entityType] ?? p.entityType} · {p.label}</p>
                    {p.error && <p className="text-xs text-red-600">{p.error}</p>}
                    {p.warning && <p className="text-xs text-amber-700">{t.problems.warning}: {p.warning}</p>}
                    <p className="text-xs text-slate-400">{t.problems.attempts(p.attempts)}{p.nextRetryAt ? ` · ${t.problems.nextRetry(new Date(p.nextRetryAt).toLocaleString())}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
