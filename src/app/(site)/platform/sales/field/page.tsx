import Link from "next/link";
import { canPlanRoutes, canViewRoutes } from "@/domain/sales-crm/field-route";
import { formatKm } from "@/domain/sales-crm/route-optimizer";
import { fieldCopy } from "@/lib/admin-locale/sales-field";
import { PLATFORM } from "@/lib/routes";
import { fieldMetrics, listRoutes } from "@/lib/sales-crm/field-route-service";
import { geocodingStatus } from "@/lib/sales-crm/geocoder";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { Badge, EmptyState, PageHeader, PermissionDenied, btnPrimary, cardCls } from "@/components/sales-crm/ui";

export default async function FieldPlannerPage() {
  const { actor, t, locale } = await loadCrmPage("read_assigned_prospects");
  if (!actor) return <PermissionDenied t={t} />;
  const f = fieldCopy(locale);
  if (!canViewRoutes(actor)) return <div className="mx-auto max-w-xl"><PageHeader title={f.title} /><p role="note" className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{f.remoteNotice}</p></div>;
  const to = new Date(), from = new Date(to.getTime() - 30 * 86_400_000);
  const [routes, m] = await Promise.all([listRoutes(actor), fieldMetrics(actor, { from, to })]);
  const planner = canPlanRoutes(actor), gc = geocodingStatus();
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const tiles: [string, string | number][] = [
    [f.metrics.routesPlanned, m.routesPlanned], [f.metrics.routesCompleted, m.routesCompleted], [f.metrics.visitsAttempted, m.visitsAttempted], [f.metrics.decisionMakersReached, m.decisionMakersReached],
    [f.metrics.demosDiscussed, m.demosDiscussed], [f.metrics.demosScheduled, m.demosScheduled], [f.metrics.followUpTasks, m.followUpTasks], [f.metrics.visitToDemo, pct(m.visitToDemoRate)],
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title={f.title} subtitle={f.subtitle} actions={planner ? <Link className={btnPrimary} href={`${PLATFORM.salesField}/new`}>{f.newRoute}</Link> : undefined} />
      {!planner && <p role="note" className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">{f.readOnly}</p>}
      {planner && gc.mode !== "SYNTHETIC" && <p role="note" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>{f.geocoding.title}: </strong>{f.geocoding[gc.mode]} {f.geocoding[gc.reason]}</p>}
      <section className={cardCls} aria-labelledby="m-h">
        <h2 id="m-h" className="mb-3 font-semibold text-slate-900">{f.metrics.title}</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(([label, v]) => <div key={label} className="min-w-0 rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="text-2xl font-semibold text-slate-900">{v}</dd></div>)}
        </dl>
        <p className="mt-2 text-xs text-slate-500">{f.metrics.note}</p>
      </section>
      <section aria-labelledby="r-h" className="space-y-3">
        <h2 id="r-h" className="font-semibold text-slate-900">{f.routes}</h2>
        {routes.length === 0 ? <EmptyState title={f.noRoutes} hint={planner ? f.noRoutesHint : undefined} /> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {routes.map((r) => (
              <li key={r.id}>
                <Link href={PLATFORM.salesFieldRoute(r.id)} className={`${cardCls} block hover:border-blue-300`}>
                  <span className="flex flex-wrap items-center gap-2"><Badge tone={r.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-800" : r.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : undefined}>{f.status[r.status]}</Badge><span className="text-sm text-slate-600">{r.plannedDate}</span></span>
                  <span className="mt-1 block break-words font-medium text-slate-900">{r.name ?? `${r.total} ${f.stops}`}</span>
                  <span className="mt-0.5 block text-sm text-slate-600">{r.done}/{r.total} {f.progress}{r.estimatedDistanceM ? ` · ${formatKm(r.estimatedDistanceM)}` : ""}{!planner || r.ownerName ? ` · ${r.ownerName ?? ""}` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
