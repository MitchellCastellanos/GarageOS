import { ADMIN, adminPath } from "@/lib/routes";
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
  CalendarDays,
  MessageSquare,
  Megaphone,
  ClipboardList,
  ChevronRight,
  Wrench,
  BarChart3,
} from "lucide-react";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { StatusPie } from "@/components/dashboard/StatusPie";
import {
  INVOICE_STATUS_BADGE,
  INVOICE_STATUS_CHART_COLOR,
  invoiceStatusLabel,
  INVOICE_PENDING_STATUSES,
} from "@/lib/invoice-status";
import { getInvoiceRecordedRevenue } from "@/lib/invoice-payments";
import { computeRevenueBreakdown } from "@/lib/revenue-analytics";
import { getAdminLocale } from "@/lib/get-admin-locale";
import type { AdminLocale } from "@/lib/admin-locale";
import { DASHBOARD_DICT, monthShort } from "@/lib/admin-locale/dashboard";
import { LAYOUT_DICT } from "@/lib/admin-locale/layout";

const PIE_STATUSES = ["PENDING", "PAID", "OVERDUE", "CANCELLED"] as const;

export default async function DashboardPage() {
  const session = await auth();
  const shopId = session?.user?.shopId;
  const locale = await getAdminLocale();
  const t = DASHBOARD_DICT[locale];
  const nav = LAYOUT_DICT[locale].nav;

  if (!shopId) {
    return <div className="text-center py-20 text-slate-500">{t.loadingShop}</div>;
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

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
    todayAppointments,
    quoteCount,
    inboxCount,
    campaignCount,
    accountingDocumentCount,
    workOrderCount,
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
    db.appointment.findMany({
      where: {
        shopId,
        startsAt: { gte: startOfDay, lt: endOfDay },
        status: { not: "CANCELLED" },
      },
      orderBy: { startsAt: "asc" },
      take: 5,
      include: { client: true, vehicle: true, mechanic: true },
    }),
    db.quote.count({ where: { shopId, status: { in: ["DRAFT", "SENT", "ACCEPTED"] } } }),
    db.communicationThread.count({ where: { shopId } }),
    db.campaign.count({ where: { shopId, status: { not: "CANCELLED" } } }),
    db.accountingDocument.count({ where: { shopId } }),
    db.workOrder.count({ where: { shopId, status: { not: "CANCELLED" } } }),
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
    return { year: d.getFullYear(), month: d.getMonth(), label: monthShort(d.getMonth(), locale) };
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
      status === "PENDING" ? invoiceStatusLabel("SENT", locale) : invoiceStatusLabel(status, locale);
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
    { label: t.breakdown.totalRevenue, value: monthBreakdown.totalRevenue },
    { label: t.breakdown.cardPayments, value: monthBreakdown.cardPayments },
    { label: t.breakdown.cashPayments, value: monthBreakdown.cashPayments },
    { label: t.breakdown.mixedPayments, value: monthBreakdown.mixedPayments },
  ];

  const metrics = [
    {
      label: t.metrics.clients,
      value: clientCount.toString(),
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
      href: "/clients",
    },
    {
      label: t.metrics.invoices,
      value: invoiceCount.toString(),
      icon: FileText,
      color: "text-violet-600",
      bg: "bg-violet-50",
      href: "/invoices",
    },
    {
      label: t.metrics.revenueThisMonth,
      value: formatCurrency(thisMonth),
      icon: DollarSign,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      href: "/invoices?status=PAID",
      extra: revenueChange,
    },
    {
      label: t.metrics.pendingReminders,
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
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {t.welcome(session?.user?.name ?? "")}
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
                  {Math.abs(metric.extra).toFixed(1)}% {t.metrics.vsLastMonth}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Centro de control: primero la operación del día, luego el reporting. */}
      <section className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-xl shadow-slate-900/10">
        <div className="grid gap-0 lg:grid-cols-[1.25fr_1fr]">
          <div className="relative p-6 sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,.35),transparent_44%)]" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">{t.commandCenter.eyebrow}</p>
              <h2 className="mt-3 max-w-lg text-2xl font-semibold tracking-tight sm:text-3xl">{t.commandCenter.title}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">{t.commandCenter.subtitle}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href={ADMIN.appointments} className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400">
                  <CalendarDays className="h-4 w-4" /> {t.commandCenter.today}
                </Link>
                <Link href={ADMIN.invoices} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900">
                  <BarChart3 className="h-4 w-4" /> {t.revenueChart.title}
                </Link>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-800 bg-slate-900/70 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{t.commandCenter.today}</p>
                <p className="mt-0.5 text-xs text-slate-400">{todayAppointments.length} {t.commandCenter.appointments}</p>
              </div>
              <CalendarDays className="h-5 w-5 text-blue-300" />
            </div>
            {todayAppointments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-400">{t.commandCenter.appointmentsEmpty}</p>
            ) : (
              <div className="space-y-2">
                {todayAppointments.map((appointment) => (
                  <Link key={appointment.id} href={`${ADMIN.appointments}/${appointment.id}`} className="flex items-center gap-3 rounded-xl bg-slate-800/80 px-3 py-2.5 transition hover:bg-slate-700">
                    <span className="w-12 text-xs font-semibold text-blue-300">{appointment.startsAt.toLocaleTimeString(t.intlLocale, { hour: "numeric", minute: "2-digit" })}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{formatClientName(appointment.client)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: t.commandCenter.openQuotes, value: quoteCount, href: ADMIN.quotes, icon: ClipboardList, color: "text-violet-600", bg: "bg-violet-50" },
          { label: t.commandCenter.conversations, value: inboxCount, href: ADMIN.inbox, icon: MessageSquare, color: "text-sky-600", bg: "bg-sky-50" },
          { label: t.commandCenter.campaigns, value: campaignCount, href: ADMIN.campaigns, icon: Megaphone, color: "text-pink-600", bg: "bg-pink-50" },
          { label: t.commandCenter.workOrders, value: workOrderCount, href: ADMIN.appointments, icon: Wrench, color: "text-orange-600", bg: "bg-orange-50" },
          { label: t.commandCenter.documents, value: accountingDocumentCount, href: ADMIN.accounting, icon: FileText, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: t.metrics.pendingReminders, value: pendingReminders, href: ADMIN.reminders, icon: Bell, color: "text-amber-600", bg: "bg-amber-50" },
        ].map(({ label, value, href, icon: Icon, color, bg }) => (
          <Link key={label} href={href} className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm">
            <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{label}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-lg font-semibold text-slate-900">{t.modules.title}</h2><p className="mt-1 text-sm text-slate-500">{t.modules.subtitle}</p></div>
          <span className="text-xs font-medium text-slate-400">{t.modules.settings}: {nav.settings}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: t.modules.operations, links: [[nav.appointments, ADMIN.appointments, CalendarDays], [nav.quotes, ADMIN.quotes, ClipboardList], [nav.reminders, ADMIN.reminders, Bell]] },
            { title: t.modules.customers, links: [[nav.clients, ADMIN.clients, Users], [nav.invoices, ADMIN.invoices, FileText], [nav.accounting, ADMIN.accounting, BarChart3]] },
            { title: t.modules.communications, links: [[nav.inbox, ADMIN.inbox, MessageSquare], [nav.campaigns, ADMIN.campaigns, Megaphone], [nav.notifications, ADMIN.notifications, Bell]] },
            { title: t.modules.finance, links: [[nav.caja, ADMIN.caja, DollarSign], [nav.invoices, ADMIN.invoices, TrendingUp], [t.modules.settings, ADMIN.settings, Wrench]] },
          ].map((group) => (
            <div key={group.title} className="rounded-xl bg-slate-50 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">{group.title}</p>
              <div className="space-y-1">
                {group.links.map(([label, href, Icon]) => {
                  const LinkIcon = Icon as typeof Users;
                  return <Link key={label as string} href={href as string} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-slate-700 transition hover:bg-white hover:text-blue-600"><LinkIcon className="h-4 w-4 text-slate-400" />{label as string}<ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-300" /></Link>;
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">{t.modules.planLabel}</p><p className="mt-1 font-semibold text-slate-900">{t.modules.planName}</p><p className="mt-1 text-sm text-slate-600">{t.modules.planHint}</p></div>
          <Link href="/#pricing" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900">{t.modules.planLink}<ArrowUpRight className="h-4 w-4" /></Link>
        </div>
      </section>

      {/* ── Desglose de ingresos (mes actual) ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-1">{t.breakdown.title}</h2>
        <p className="text-xs text-slate-400 mb-4">
          {t.breakdown.subtitle}
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
          <h2 className="font-semibold text-slate-900 mb-1">{t.revenueChart.title}</h2>
          <p className="text-xs text-slate-400 mb-4">{t.revenueChart.subtitle}</p>
          <RevenueChart data={revenueByMonth} />
        </div>

        {/* Estado de facturas */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-1">{t.statusChart.title}</h2>
          <p className="text-xs text-slate-400 mb-2">{t.statusChart.subtitle}</p>
          <StatusPie data={statusPieData} />
        </div>
      </div>

      {/* ── Top clientes + Facturas recientes + Acciones ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top 5 clientes */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">{t.topClients.title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t.topClients.subtitle}</p>
          </div>
          {topClients.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              {t.topClients.empty}
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
              <h2 className="font-semibold text-slate-900">{t.recentInvoices.title}</h2>
            </div>
            <Link href={ADMIN.invoices} className="text-xs text-blue-600 hover:underline">
              {t.recentInvoices.viewAll}
            </Link>
          </div>
          {recentInvoices.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>{t.recentInvoices.empty}</p>
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
                    <StatusBadge status={invoice.status} locale={locale} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Acciones rápidas */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">{t.quickActions.title}</h2>
          <div className="space-y-2">
            {[
              { href: "/clients/new", label: t.quickActions.newClient, icon: Users, bg: "bg-blue-50", color: "text-blue-600" },
              { href: "/invoices/new", label: t.quickActions.newInvoice, icon: FileText, bg: "bg-violet-50", color: "text-violet-600" },
              { href: "/reminders/new", label: t.quickActions.newReminder, icon: Bell, bg: "bg-amber-50", color: "text-amber-600" },
              { href: "/accounting", label: t.quickActions.uploadDocument, icon: Plus, bg: "bg-slate-100", color: "text-slate-600" },
              { href: "/caja", label: t.quickActions.cashRegister, icon: DollarSign, bg: "bg-emerald-50", color: "text-emerald-600" },
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
              {t.remindersAlert.pending(pendingReminders)}
            </p>
            <Link href={ADMIN.reminders} className="text-xs text-amber-700 hover:underline">
              {t.remindersAlert.viewReminders}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, locale }: { status: string; locale: AdminLocale }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${INVOICE_STATUS_BADGE[status] ?? "bg-slate-100 text-slate-500"}`}
    >
      {invoiceStatusLabel(status, locale)}
    </span>
  );
}
