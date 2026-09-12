import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { formatClientName } from "@/lib/client-name";
import Link from "next/link";
import {
  Users,
  FileText,
  DollarSign,
  Bell,
  TrendingUp,
  AlertCircle,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { StatusPie } from "@/components/dashboard/StatusPie";
import {
  INVOICE_STATUS_BADGE,
  INVOICE_STATUS_CHART_COLOR,
  INVOICE_STATUS_LABEL,
  INVOICE_PENDING_STATUSES,
} from "@/lib/invoice-status";
import { getInvoiceRecordedRevenue } from "@/lib/invoice-payments";
import { computeRevenueBreakdown } from "@/lib/revenue-analytics";

// Nombres cortos de meses en español
const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const PIE_STATUSES = ["PENDING", "PAID", "OVERDUE", "CANCELLED"] as const;

export default async function DashboardPage() {
  const session = await auth();
  const shopId = session?.user?.shopId;

  if (!shopId) {
    return <div className="text-center py-20 text-slate-500">Configurando tu taller...</div>;
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  // 6 meses atrás (primer día)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    clientCount,
    invoiceCount,
    pendingReminders,
    recentInvoices,
    paidInvoicesThisMonth,
    paidInvoicesLastMonth,
    paidInvoicesLast6Months,
    invoicesByStatus,
    allPaidInvoices,
  ] = await Promise.all([
    db.client.count({ where: { shopId } }),
    db.invoice.count({ where: { shopId } }),
    db.serviceReminder.count({ where: { shopId, status: "PENDING" } }),
    db.invoice.findMany({
      where: { shopId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { client: true },
    }),
    // Ingresos este mes
    db.invoice.findMany({
      where: { shopId, status: "PAID", paidAt: { gte: startOfMonth } },
      select: {
        total: true,
        status: true,
        paymentMode: true,
        paymentEntries: { select: { method: true, amount: true } },
      },
    }),
    db.invoice.findMany({
      where: {
        shopId,
        status: "PAID",
        paidAt: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
      select: { total: true, status: true },
    }),
    db.invoice.findMany({
      where: { shopId, status: "PAID", paidAt: { gte: sixMonthsAgo } },
      select: { paidAt: true, total: true, status: true },
    }),
    // Conteo por estado (para el PieChart)
    db.invoice.groupBy({
      by: ["status"],
      where: { shopId },
      _count: { _all: true },
    }),
    // Top 5 clientes por ingreso
    db.invoice.findMany({
      where: { shopId, status: "PAID" },
      select: { clientId: true, total: true, status: true },
    }),
  ]);

  const thisMonthRevenue = paidInvoicesThisMonth.reduce(
    (sum, inv) => sum + getInvoiceRecordedRevenue(inv),
    0
  );
  const lastMonthRevenue = paidInvoicesLastMonth.reduce(
    (sum, inv) => sum + getInvoiceRecordedRevenue(inv),
    0
  );

  // ── Procesar datos para charts (serializar: sin Decimal ni Date) ──

  // Revenue por mes (últimos 6 meses)
  const revenueByMonth = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth(), label: MONTH_NAMES[d.getMonth()] };
  }).map(({ year, month, label }) => {
    const revenue = paidInvoicesLast6Months
      .filter((inv) => {
        const paid = inv.paidAt!;
        return paid.getFullYear() === year && paid.getMonth() === month;
      })
      .reduce((sum, inv) => sum + getInvoiceRecordedRevenue(inv), 0);
    return { month: label, revenue: Math.round(revenue * 100) / 100 };
  });

  const pendingCount = invoicesByStatus
    .filter((s) => (INVOICE_PENDING_STATUSES as readonly string[]).includes(s.status))
    .reduce((sum, s) => sum + s._count._all, 0);

  const statusPieData = PIE_STATUSES.map((status) => {
    const count =
      status === "PENDING"
        ? pendingCount
        : invoicesByStatus.find((s) => s.status === status)?._count._all ?? 0;
    const label =
      status === "PENDING" ? "Pendiente" : (INVOICE_STATUS_LABEL[status] ?? status);
    const color =
      status === "PENDING"
        ? INVOICE_STATUS_CHART_COLOR.SENT
        : (INVOICE_STATUS_CHART_COLOR[status] ?? "#94a3b8");
    return { status, label, count, color };
  });

  const revenueByClient = new Map<string, number>();
  for (const inv of allPaidInvoices) {
    revenueByClient.set(
      inv.clientId,
      (revenueByClient.get(inv.clientId) ?? 0) + getInvoiceRecordedRevenue(inv)
    );
  }
  const topClientIds = [...revenueByClient.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);
  const topClientDetails = await db.client.findMany({
    where: { id: { in: topClientIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const topClients = topClientIds.map((clientId) => {
    const client = topClientDetails.find((c) => c.id === clientId);
    return {
      id: clientId,
      name: client ? formatClientName(client) : "—",
      total: revenueByClient.get(clientId) ?? 0,
    };
  });

  const thisMonth = thisMonthRevenue;
  const lastMonth = lastMonthRevenue;
  const revenueChange =
    lastMonth === 0 ? null : ((thisMonth - lastMonth) / lastMonth) * 100;

  const monthBreakdown = computeRevenueBreakdown(paidInvoicesThisMonth);
  const breakdownCards = [
    { label: "Ingreso total", value: monthBreakdown.totalRevenue },
    { label: "Pagos con tarjeta", value: monthBreakdown.cardPayments },
    { label: "Pagos en efectivo", value: monthBreakdown.cashPayments },
    { label: "Pagos mixtos", value: monthBreakdown.mixedPayments },
  ];

  const metrics = [
    {
      label: "Clientes registrados",
      value: clientCount.toString(),
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
      href: "/clients",
    },
    {
      label: "Facturas totales",
      value: invoiceCount.toString(),
      icon: FileText,
      color: "text-violet-600",
      bg: "bg-violet-50",
      href: "/invoices",
    },
    {
      label: "Ingresos este mes",
      value: formatCurrency(thisMonth),
      icon: DollarSign,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      href: "/invoices?status=PAID",
      extra: revenueChange,
    },
    {
      label: "Recordatorios pendientes",
      value: pendingReminders.toString(),
      icon: Bell,
      color: "text-amber-600",
      bg: "bg-amber-50",
      href: "/reminders",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">
          Bienvenido, {session?.user?.name}
        </p>
      </div>

      {/* ── Métricas ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Link
              key={metric.label}
              href={metric.href}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-slate-500">{metric.label}</p>
                <div className={`w-9 h-9 rounded-lg ${metric.bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${metric.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900">{metric.value}</p>
              {/* Cambio % de ingresos */}
              {metric.extra != null && (
                <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${metric.extra >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {metric.extra >= 0
                    ? <ArrowUpRight className="w-3.5 h-3.5" />
                    : <ArrowDownRight className="w-3.5 h-3.5" />
                  }
                  {Math.abs(metric.extra).toFixed(1)}% vs mes anterior
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* ── Desglose de ingresos (mes actual) ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-1">Ingresos del mes — desglose</h2>
        <p className="text-xs text-slate-400 mb-4">
          Método de pago y visibilidad contable son independientes. Solo interno no se exporta automáticamente a contabilidad.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {breakdownCards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5"
            >
              <p className="text-[11px] text-slate-500 leading-tight">{card.label}</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">
                {formatCurrency(card.value)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Ingresos últimos 6 meses */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Ingresos (últimos 6 meses)</h2>
          <p className="text-xs text-slate-400 mb-4">Solo facturas marcadas como pagadas</p>
          <RevenueChart data={revenueByMonth} />
        </div>

        {/* Estado de facturas */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Estado de facturas</h2>
          <p className="text-xs text-slate-400 mb-2">Distribución actual</p>
          <StatusPie data={statusPieData} />
        </div>
      </div>

      {/* ── Top clientes + Facturas recientes + Acciones ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top 5 clientes */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Top clientes</h2>
            <p className="text-xs text-slate-400 mt-0.5">Por ingresos (facturas pagadas)</p>
          </div>
          {topClients.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              Sin datos todavía
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {topClients.map((client, i) => (
                <div key={client.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-xs font-bold text-slate-300 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{client.name}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 flex-shrink-0">
                    {formatCurrency(client.total)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Facturas recientes */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-400" />
              <h2 className="font-semibold text-slate-900">Facturas recientes</h2>
            </div>
            <Link href={ADMIN.invoices} className="text-xs text-blue-600 hover:underline">
              Ver todas →
            </Link>
          </div>
          {recentInvoices.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>Sin facturas todavía</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentInvoices.map((invoice) => (
                <Link
                  key={invoice.id}
                  href={adminPath(`/invoices/${invoice.id}`)}
                  className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{invoice.invoiceNumber}</p>
                    <p className="text-xs text-slate-500">
                      {formatClientName(invoice.client)}
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
          )}
        </div>

        {/* Acciones rápidas */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Acciones rápidas</h2>
          <div className="space-y-2">
            {[
              { href: "/clients/new", label: "Nuevo cliente", icon: Users, bg: "bg-blue-50", color: "text-blue-600" },
              { href: "/invoices/new", label: "Nueva factura", icon: FileText, bg: "bg-violet-50", color: "text-violet-600" },
              { href: "/reminders/new", label: "Nuevo recordatorio", icon: Bell, bg: "bg-amber-50", color: "text-amber-600" },
              { href: "/accounting", label: "Subir documento", icon: Plus, bg: "bg-slate-100", color: "text-slate-600" },
              { href: "/caja", label: "Caja / efectivo", icon: DollarSign, bg: "bg-emerald-50", color: "text-emerald-600" },
            ].map(({ href, label, icon: Icon, bg, color }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-sm"
              >
                <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <span className="font-medium text-slate-700">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Alerta recordatorios pendientes */}
      {pendingReminders > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {pendingReminders} recordatorio{pendingReminders !== 1 ? "s" : ""} pendiente{pendingReminders !== 1 ? "s" : ""}
            </p>
            <Link href={ADMIN.reminders} className="text-xs text-amber-700 hover:underline">
              Ver recordatorios →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${INVOICE_STATUS_BADGE[status] ?? "bg-slate-100 text-slate-500"}`}
    >
      {INVOICE_STATUS_LABEL[status] ?? status}
    </span>
  );
}
