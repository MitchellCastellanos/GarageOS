import Link from "next/link";
import { requirePagePermission, currentUserCan } from "@/lib/access";
import { getReport, getReportLocationOptions } from "@/actions/reports";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { REPORTS_DICT, type ReportsDictionary } from "@/lib/admin-locale/reports";
import { ADMIN } from "@/lib/routes";
import { BASIC_KINDS, BASIC_PRESETS, FINANCIAL_KINDS, REPORT_KINDS, REPORT_PRESETS, isReportKind, type ReportKind } from "@/domain/reports";
import { formatCurrency } from "@/lib/utils";
import { UpgradeCTA } from "@/components/billing/UpgradeCTA";
import { ReportControls } from "@/components/reports/ReportControls";
import type {
  CustomersReport,
  InventoryReport,
  LocationComparisonReport,
  OperationsReport,
  OverviewReport,
  ReceivablesReport,
  SalesReport,
} from "@/lib/reports-service";

interface Props {
  searchParams: Promise<{ kind?: string; preset?: string; from?: string; to?: string; location?: string }>;
}

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 1000) / 10}%`);

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
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

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-slate-400">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
          {head.map((h, i) => <th key={h} className={`py-2 pr-3 font-medium ${i > 0 ? "text-right" : ""}`}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-slate-50 last:border-0">
            {r.map((c, j) => <td key={j} className={`py-2 pr-3 ${j > 0 ? "text-right tabular-nums" : ""}`}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Bars({ points }: { points: { key: string; total: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.total));
  return (
    <div className="flex items-end gap-1 h-32" role="img" aria-label="chart">
      {points.map((p) => (
        <div key={p.key} className="flex-1 min-w-[3px] bg-blue-500/80 rounded-t" style={{ height: `${Math.max(2, (p.total / max) * 100)}%` }} title={`${p.key}: ${formatCurrency(p.total)}`} />
      ))}
    </div>
  );
}

function Overview({ d, t }: { d: OverviewReport; t: ReportsDictionary }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {d.revenue && <Kpi label={t.kpi.revenue} value={formatCurrency(d.revenue.net)} hint={`${d.revenue.invoices} ${t.kpi.invoices.toLowerCase()}${d.revenue.refunds ? ` · ${t.kpi.refunds}: ${formatCurrency(d.revenue.refunds)}` : ""}`} />}
        {d.outstanding && <Kpi label={t.kpi.outstanding} value={formatCurrency(d.outstanding.total)} hint={`${d.outstanding.invoices} ${t.kpi.outstandingInvoices.toLowerCase()}`} />}
        <Kpi label={t.kpi.woCreated} value={d.workOrders.created} hint={`${d.workOrders.openNow} ${t.kpi.woOpen.toLowerCase()}`} />
        <Kpi label={t.kpi.newClients} value={d.newClients} />
      </div>
      {d.series && <Card title={t.table.seriesTitle}><Bars points={d.series} /></Card>}
      {!d.revenue && <p className="text-sm text-slate-500">{t.errors.noFinancial}</p>}
    </>
  );
}

function Sales({ d, t, names }: { d: SalesReport; t: ReportsDictionary; names: Map<string, string> }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label={t.kpi.total} value={formatCurrency(d.totals.total)} hint={`${d.totals.invoices} ${t.kpi.invoices.toLowerCase()}`} />
        <Kpi label={t.kpi.subtotal} value={formatCurrency(d.totals.subtotal)} />
        <Kpi label={t.kpi.tax} value={formatCurrency(d.totals.tax)} />
        <Kpi label={t.kpi.average} value={formatCurrency(d.totals.average)} hint={t.notes.aro} />
        <Kpi label={t.kpi.net} value={formatCurrency(d.net)} hint={`${t.kpi.refunds}: ${formatCurrency(d.refunds.total)} (${d.refunds.count})`} />
      </div>
      {d.taxByName.length > 0 && (
        <Card title={t.kpi.tax}>
          <Table head={[t.table.item, t.table.amount]} rows={d.taxByName.map((x) => [x.name, formatCurrency(x.amount)])} empty={t.empty} />
        </Card>
      )}
      <Card title={t.table.seriesTitle}><Bars points={d.series} /></Card>
      {d.byLocation.length > 1 && (
        <Card title={t.table.byLocation}>
          <Table head={[t.table.location, t.table.count, t.table.amount]} rows={d.byLocation.map((l) => [names.get(l.shopId) ?? "—", l.invoices, formatCurrency(l.total)])} empty={t.empty} />
        </Card>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <Card title={t.table.byMethod}>
          <Table head={[t.table.method, t.table.amount]} rows={d.byMethod.map((m) => [t.methods[m.method] ?? m.method, formatCurrency(m.amount)])} empty={t.empty} />
        </Card>
        <Card title={t.table.byType}>
          <Table head={[t.table.type, t.table.amount]} rows={d.byItemType.map((m) => [t.itemTypes[m.type], formatCurrency(m.amount)])} empty={t.empty} />
        </Card>
      </div>
      <Card title={t.table.top}>
        <Table head={[t.table.item, t.table.qty, t.table.amount]} rows={d.topServices.map((s) => [s.description, s.quantity, formatCurrency(s.amount)])} empty={t.empty} />
      </Card>
      <p className="text-xs text-slate-400">{t.notes.basis}</p>
    </>
  );
}

function Locations({ d, t }: { d: LocationComparisonReport; t: ReportsDictionary }) {
  const best = d.rows.length > 1 ? Math.max(...d.rows.map((r) => r.net)) : null;
  const cells = (name: string, r: LocationComparisonReport["totals"]): (string | number)[] => [
    name, r.paidInvoices, formatCurrency(r.revenue), formatCurrency(r.refunds), formatCurrency(r.net), formatCurrency(r.average),
    formatCurrency(r.outstanding), r.workOrdersCreated, r.workOrdersOpen, r.newClients,
  ];
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={t.kpi.net} value={formatCurrency(d.totals.net)} hint={`${d.totals.paidInvoices} ${t.kpi.invoices.toLowerCase()}`} />
        <Kpi label={t.kpi.outstanding} value={formatCurrency(d.totals.outstanding)} />
        <Kpi label={t.kpi.woCreated} value={d.totals.workOrdersCreated} hint={`${d.totals.workOrdersOpen} ${t.kpi.woOpen.toLowerCase()}`} />
        <Kpi label={t.kpi.newClients} value={d.totals.newClients} />
      </div>
      <Card title={t.table.comparison}>
        <Table
          head={[t.table.location, t.kpi.invoices, t.kpi.revenue, t.table.refundsCol, t.table.netCol, t.table.avgCol, t.kpi.outstanding, t.table.woCreatedCol, t.table.woOpenCol, t.table.newCustomersCol]}
          rows={[...d.rows.map((r) => cells(r.net === best && best > 0 ? `${r.name} ★` : r.name, r)), cells(t.table.total, d.totals)]}
          empty={t.empty}
        />
      </Card>
      <p className="text-xs text-slate-400">{t.notes.basis}</p>
    </>
  );
}

function Receivables({ d, t }: { d: ReceivablesReport; t: ReportsDictionary }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={t.kpi.outstanding} value={formatCurrency(d.totals.outstanding)} hint={`${d.totals.invoices} ${t.kpi.outstandingInvoices.toLowerCase()}`} />
      </div>
      <Card title={t.table.aging}>
        <Table head={[t.table.bucket, t.table.count, t.table.amount]} rows={d.aging.map((a) => [t.aging[a.bucket], a.invoices, formatCurrency(a.amount)])} empty={t.empty} />
      </Card>
      <Card title={t.table.oldest}>
        <Table
          head={[t.table.invoice, t.table.customer, t.table.due, t.table.late, t.table.amount]}
          rows={d.oldest.map((o) => [o.invoiceNumber, o.client, o.dueYmd ?? o.issuedYmd, Math.max(o.daysPastDue, 0), formatCurrency(o.total)])}
          empty={t.empty}
        />
      </Card>
    </>
  );
}

function Operations({ d, t }: { d: OperationsReport; t: ReportsDictionary }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={t.kpi.woCreated} value={d.workOrders.created} />
        <Kpi label={t.kpi.completed} value={d.workOrders.completed} />
        <Kpi label={t.kpi.avgDays} value={d.workOrders.avgDaysToComplete ?? "—"} hint={t.notes.days} />
        <Kpi label={t.kpi.woOpen} value={d.workOrders.openNow} />
        <Kpi label={t.kpi.quotes} value={d.quotes.created} />
        <Kpi label={t.kpi.approvalRate} value={pct(d.quotes.approvalRate)} />
        {d.quotes.value != null && <Kpi label={t.kpi.quoteValue} value={formatCurrency(d.quotes.value)} />}
        {d.quotes.acceptedValue != null && <Kpi label={t.kpi.quoteAccepted} value={formatCurrency(d.quotes.acceptedValue)} />}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card title={t.table.wo}><Table head={[t.table.status, t.table.count]} rows={d.workOrders.byStatus.map((s) => [t.statuses[s.status] ?? s.status, s.count])} empty={t.empty} /></Card>
        <Card title={t.table.quotes}><Table head={[t.table.status, t.table.count]} rows={d.quotes.byStatus.map((s) => [t.statuses[s.status] ?? s.status, s.count])} empty={t.empty} /></Card>
      </div>
    </>
  );
}

function Customers({ d, t }: { d: CustomersReport; t: ReportsDictionary }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={t.kpi.newClients} value={d.newClients} />
        <Kpi label={t.kpi.active} value={d.activeClients} />
        <Kpi label={t.kpi.returning} value={d.returningClients} />
        <Kpi label={t.kpi.retention} value={pct(d.retentionRate)} hint={t.notes.retention} />
      </div>
      {d.top && (
        <Card title={t.table.topCustomers}>
          <Table head={[t.table.customer, t.table.count, t.table.amount]} rows={d.top.map((c) => [c.name, c.invoices, formatCurrency(c.total)])} empty={t.empty} />
        </Card>
      )}
    </>
  );
}

function Inventory({ d, t }: { d: InventoryReport; t: ReportsDictionary }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={t.kpi.parts} value={d.activeParts} />
        <Kpi label={t.kpi.low} value={d.lowStock.length} />
        {d.stockValue != null && <Kpi label={t.kpi.stockValue} value={formatCurrency(d.stockValue)} />}
        <Kpi label={t.kpi.consumed} value={d.consumedUnits} />
      </div>
      <Card title={t.table.lowStock}>
        <Table head={[t.table.name, t.table.onHand, t.table.threshold]} rows={d.lowStock.map((p) => [p.sku ? `${p.name} (${p.sku})` : p.name, p.onHand, p.threshold])} empty={t.empty} />
      </Card>
    </>
  );
}

export default async function ReportsPage({ searchParams }: Props) {
  await requirePagePermission("reports.view");
  const sp = await searchParams;
  const locale = await getAdminLocale();
  const t = REPORTS_DICT[locale];
  const canFinance = await currentUserCan("financial.view");
  const kind: ReportKind = isReportKind(sp.kind) && (canFinance || !FINANCIAL_KINDS.includes(sp.kind)) ? sp.kind : "overview";

  const options = await getReportLocationOptions();
  const location = options.enabled ? sp.location ?? "active" : "active";
  const res = await getReport({ kind, preset: sp.preset, from: sp.from, to: sp.to, location });
  const err = "error" in res ? (res.error as keyof ReportsDictionary["errors"]) : null;
  const advanced = err ? err !== "UPGRADE_REQUIRED" : (res as { advanced: boolean }).advanced;
  const visibleKinds = REPORT_KINDS.filter((k) => (canFinance || !FINANCIAL_KINDS.includes(k)) && (k !== "locations" || options.enabled));

  // Core (o un preset no permitido): vuelve al resumen básico del mes.
  const basicFallback = err === "UPGRADE_REQUIRED" ? await getReport({ kind: "overview" }) : null;
  const shown = basicFallback ?? res;

  const presets = (advanced ? REPORT_PRESETS : BASIC_PRESETS) as readonly string[];
  const range = "error" in shown ? null : shown.range;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.subtitle}</p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label={t.title}>
        {visibleKinds.map((k) => {
          const locked = !advanced && !BASIC_KINDS.includes(k);
          const q = new URLSearchParams({ kind: k });
          if (sp.preset) q.set("preset", sp.preset);
          if (location !== "active") q.set("location", location);
          return (
            <Link key={k} href={`${ADMIN.reports}?${q.toString()}`} className={`px-3 py-1.5 rounded-full text-sm border ${k === kind ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
              {t.kinds[k]}{locked ? " 🔒" : ""}
            </Link>
          );
        })}
      </nav>

      {range && (
        <ReportControls
          kind={"error" in res ? "overview" : kind}
          preset={range.preset}
          from={range.fromYmd}
          to={range.toYmd}
          presets={[...presets]}
          canExport={advanced}
          locations={options.enabled ? options.locations : []}
          location={location}
        />
      )}

      {err === "UPGRADE_REQUIRED" && (
        <UpgradeCTA requiredPlan="PRO" title={t.locked.title} description={`${t.locked.description} ${t.locked.basicNote}`} ctaLabel={t.locked.cta} compact />
      )}
      {options.enabled && range && (
        <p className="text-xs text-slate-500">
          {t.filters.location}: <span className="font-medium text-slate-700">{"data" in shown && shown.scopeMode !== "active" ? (shown.scopeMode === "all" ? t.filters.allLocations : (shown.locations ?? []).map((l) => l.name).join(", ")) : options.locations.find((l) => l.id === options.activeShopId)?.name}</span> · {t.filters.multiNote}
        </p>
      )}
      {err && err !== "UPGRADE_REQUIRED" && <p role="alert" className="text-sm text-red-600">{t.errors[err]}</p>}

      {"data" in shown && shown.kind === "overview" && <Overview d={shown.data as OverviewReport} t={t} />}
      {"data" in shown && shown.kind === "sales" && <Sales d={shown.data as SalesReport} t={t} names={new Map((shown.locations ?? []).map((l) => [l.id, l.name]))} />}
      {"data" in shown && shown.kind === "receivables" && <Receivables d={shown.data as ReceivablesReport} t={t} />}
      {"data" in shown && shown.kind === "operations" && <Operations d={shown.data as OperationsReport} t={t} />}
      {"data" in shown && shown.kind === "customers" && <Customers d={shown.data as CustomersReport} t={t} />}
      {"data" in shown && shown.kind === "locations" && <Locations d={shown.data as LocationComparisonReport} t={t} />}
      {"data" in shown && shown.kind === "inventory" && <Inventory d={shown.data as InventoryReport} t={t} />}
    </div>
  );
}
