import { getAccountingSummaryAction, getFinancialActivityAction, type AccountingInput } from "@/actions/accounting";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { ACCOUNTING_DICT } from "@/lib/admin-locale/accounting";
import { UpgradeCTA } from "@/components/billing/UpgradeCTA";
import { AccountingControls } from "@/components/accounting/AccountingControls";
import { FinancialActivityLog } from "@/components/accounting/FinancialActivityLog";
import { formatCurrency } from "@/lib/utils";

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

const th = "py-2 pr-3 font-medium text-right";

export async function AccountingLightPanel({ tab, input }: { tab: "summary" | "taxes" | "activity"; input: AccountingInput }) {
  const locale = await getAdminLocale();
  const t = ACCOUNTING_DICT[locale];

  if (tab === "activity") {
    const res = await getFinancialActivityAction(null);
    if ("error" in res) return <UpgradeCTA requiredPlan="PRO" title={t.locked.title} description={t.locked.description} ctaLabel={t.locked.cta} compact />;
    return (
      <div className="space-y-4">
        <AccountingControls tab="activity" preset="thisYear" from="" to="" basis="issued" exportOnly exports={[{ kind: "activity", label: t.exports.activity }]} />
        <Card title={t.activity.title}><FinancialActivityLog initial={res.rows} nextCursor={res.nextCursor} /></Card>
      </div>
    );
  }

  const res = await getAccountingSummaryAction(input);
  if ("error" in res) {
    if (res.error === "UPGRADE_REQUIRED") return <UpgradeCTA requiredPlan="PRO" title={t.locked.title} description={t.locked.description} ctaLabel={t.locked.cta} compact />;
    return <p role="alert" className="text-sm text-red-600">{t.errors[res.error as keyof typeof t.errors]}</p>;
  }
  const { summary: s, range } = res;
  const exports = [
    { kind: "sales-journal", label: t.exports.salesJournal },
    { kind: "payments", label: t.exports.payments },
    { kind: "tax-summary", label: t.exports.taxSummary },
    { kind: "activity", label: t.exports.activity },
  ];

  return (
    <div className="space-y-4">
      <AccountingControls tab={tab} preset={range.preset} from={range.fromYmd} to={range.toYmd} basis={s.basis} exports={exports} />

      {tab === "summary" ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label={t.summary.gross} value={formatCurrency(s.gross.total)} hint={`${s.gross.invoices} ${t.summary.invoices.toLowerCase()}`} />
            <Kpi label={t.summary.refunds} value={formatCurrency(-s.refunds.total)} hint={`${s.refunds.count}`} />
            <Kpi label={t.summary.net} value={formatCurrency(s.net.total)} hint={`${t.summary.subtotal}: ${formatCurrency(s.net.beforeTax)}`} />
            <Kpi label={t.summary.outstanding} value={formatCurrency(s.outstanding.total)} hint={`${s.outstanding.invoices} ${t.summary.unpaidInvoices}`} />
          </div>
          <Card title={t.summary.paymentsReceived}>
            {s.payments.length === 0 ? <p className="text-sm text-slate-400">—</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="py-2 pr-3 font-medium">{t.summary.method}</th><th className={th}>{t.summary.paymentsReceived}</th><th className={th}>{t.summary.refundsPaid}</th><th className={th}>{t.summary.netCash}</th>
                </tr></thead>
                <tbody>
                  {s.payments.map((p) => (
                    <tr key={p.method} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 pr-3">{t.methods[p.method as keyof typeof t.methods] ?? p.method}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(p.received)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(-p.refunded)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums font-medium">{formatCurrency(p.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <p className="text-xs text-slate-400">{t.summary.basisNote[s.basis]}</p>
        </>
      ) : (
        <Card title={t.taxes.title}>
          {s.taxes.length === 0 ? <p className="text-sm text-slate-400">{t.taxes.none}</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="py-2 pr-3 font-medium">{t.taxes.tax}</th><th className={th}>{t.taxes.taxableSales}</th><th className={th}>{t.taxes.collected}</th><th className={th}>{t.taxes.refunded}</th><th className={th}>{t.taxes.net}</th>
              </tr></thead>
              <tbody>
                {s.taxes.map((x) => (
                  <tr key={x.name} className="border-b border-slate-50">
                    <td className="py-2 pr-3">{x.name}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(x.taxableSales)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(x.collected)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(-x.refunded)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium">{formatCurrency(x.net)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-3">Total</td><td /><td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(s.gross.tax)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(-s.refunds.tax)}</td><td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(s.net.tax)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>
      )}
      <p className="text-xs text-slate-400">{t.summary.disclaimer}</p>
    </div>
  );
}
