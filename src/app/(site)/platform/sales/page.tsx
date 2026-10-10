import Link from "next/link";
import { dashboardMetrics } from "@/lib/sales-crm/queries";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { BOARD_STAGES } from "@/domain/sales-crm/pipeline";
import { PLATFORM } from "@/lib/routes";
import { Badge, EmptyState, PageHeader, PermissionDenied, btnPrimary, btnSecondary, cardCls, formatDate } from "@/components/sales-crm/ui";

export default async function SalesDashboardPage() {
  const { actor, t, locale } = await loadCrmPage("read_assigned_prospects");
  if (!actor) return <PermissionDenied t={t} />;
  const m = await dashboardMetrics(actor);
  const d = t.dashboard;
  const subtitle = actor.all ? d.subtitleAll : actor.kind === "SALES_MANAGER" ? d.subtitleTeam : d.subtitleMine;
  const max = Math.max(1, ...BOARD_STAGES.map((s) => m.stageCounts[s] ?? 0));
  const stats: { label: string; value: number; tone?: string; href?: string }[] = [
    { label: d.prospects, value: m.totalProspects, href: PLATFORM.salesProspects },
    { label: d.newThisMonth, value: m.newProspects30 },
    { label: d.openOpps, value: m.openCount, href: PLATFORM.salesPipeline },
    { label: d.overdue, value: m.overdue, tone: m.overdue ? "text-rose-700" : undefined, href: `${PLATFORM.salesTasks}?view=overdue` },
    { label: d.dueToday, value: m.dueToday, href: `${PLATFORM.salesTasks}?view=today` },
    { label: d.stale, value: m.stale, tone: m.stale ? "text-amber-700" : undefined },
    { label: d.activities7, value: m.activities7 },
    ...(actor.all || actor.kind === "SALES_MANAGER" ? [{ label: d.unassigned, value: m.unassigned, tone: m.unassigned ? "text-amber-700" : undefined, href: `${PLATFORM.salesProspects}?owner=none` }] : []),
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title={d.title} subtitle={subtitle} actions={<>
        <Link href={PLATFORM.salesProspectNew} className={btnPrimary}>{d.newProspect}</Link>
        <Link href={PLATFORM.salesProspectImport} className={btnSecondary}>{d.importCsv}</Link>
        <Link href={PLATFORM.salesNew} className={btnSecondary}>{d.prepareDemo}</Link>
      </>} />

      <section aria-label={d.title} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => {
          const body = <><p className="text-sm text-slate-600">{s.label}</p><p className={`mt-1 text-3xl font-semibold ${s.tone ?? "text-slate-900"}`}>{s.value}</p></>;
          return s.href
            ? <Link key={s.label} href={s.href} className={`${cardCls} block hover:border-blue-300`}>{body}</Link>
            : <div key={s.label} className={cardCls}>{body}</div>;
        })}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${cardCls} lg:col-span-2`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">{d.funnel}</h2>
            <Link href={PLATFORM.salesPipeline} className="text-sm text-blue-700">{d.openPipeline}</Link>
          </div>
          {m.openCount === 0 ? <EmptyState title={t.states.emptyPipeline} /> : (
            <ul className="space-y-2">
              {BOARD_STAGES.map((s) => {
                const n = m.stageCounts[s] ?? 0;
                return (
                  <li key={s} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-3 text-sm sm:grid-cols-[9rem_1fr_2.5rem]">
                    <span className="truncate text-slate-700">{t.stages[s]}</span>
                    <span className="h-3 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-blue-500" style={{ width: `${(n / max) * 100}%` }} /></span>
                    <span className="text-right font-medium tabular-nums">{n}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-500">{d.wonLost}: <b>{m.won}</b> / <b>{m.lost}</b> — {d.honest}</p>
        </section>

        <section className={cardCls}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">{d.upcoming}</h2>
            <Link href={PLATFORM.salesTasks} className="text-sm text-blue-700">{d.viewAll}</Link>
          </div>
          {m.recentTasks.length === 0 ? <p className="text-sm text-slate-500">{t.states.emptyTasks}</p> : (
            <ul className="space-y-2">
              {m.recentTasks.map((task) => (
                <li key={task.id} className="rounded-lg border border-slate-200 p-2.5 text-sm">
                  <Link href={PLATFORM.salesProspect(task.prospect.id)} className="block break-words font-medium text-slate-900 hover:text-blue-700">{task.title}</Link>
                  <p className="break-words text-slate-500">{task.prospect.name}</p>
                  <p className={task.dueAt < new Date() ? "text-rose-700" : "text-slate-500"}>{formatDate(task.dueAt, locale, true)}{task.dueAt < new Date() && <> · <Badge tone="bg-rose-100 text-rose-800">{t.tasks.overdue}</Badge></>}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={cardCls}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">{d.demosTitle}</h2>
          <Link href={PLATFORM.salesDemos} className="text-sm text-blue-700">{d.viewAll}</Link>
        </div>
        {Object.keys(m.demosByStatus).length === 0 ? <p className="text-sm text-slate-500">{t.states.emptyDemos}</p> : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(m.demosByStatus).map(([status, n]) => <Badge key={status}>{t.demoStatus[status] ?? status}: {n}</Badge>)}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">{t.demos.help}</p>
      </section>
    </div>
  );
}
