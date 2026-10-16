"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, Phone } from "lucide-react";
import { cancelFieldRoute, completeFieldRoute, skipFieldStop, startFieldRoute, submitFieldVisit } from "@/actions/sales-field";
import { navigationUrl, NAV_APPS } from "@/domain/sales-crm/navigation";
import { formatKm } from "@/domain/sales-crm/route-optimizer";
import { fieldCopy } from "@/lib/admin-locale/sales-field";
import { PLATFORM } from "@/lib/routes";
import { Badge, btnDanger, btnPrimary, btnSecondary, cardCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";
import { RouteMap, type MapConfig } from "@/components/sales-field/RouteMap";
import { VisitResultForm } from "@/components/sales-field/VisitResultForm";

export interface RunStop { id: string; prospectId: string; position: number; status: string; name: string; address: string | null; lat: number; lng: number; outcome: string | null; blocked: string | null; phone: string | null }
export interface RunRouteProps {
  locale: "en" | "fr"; mapConfig: MapConfig | null;
  route: { id: string; plannedDate: string; name: string | null; status: string; estimatedDistanceM: number | null; canMutate: boolean; ownerName: string | null; stops: RunStop[] };
}

const tone: Record<string, string> = { PENDING: "bg-slate-100 text-slate-700", VISITED: "bg-emerald-100 text-emerald-800", SKIPPED: "bg-amber-100 text-amber-900", UNAVAILABLE: "bg-rose-100 text-rose-800" };

export function RunRoute({ locale, mapConfig, route }: RunRouteProps) {
  const t = fieldCopy(locale), r = t.run;
  const router = useRouter();
  const { pending, error, notice, run } = useCrmAction(locale);
  const stops = route.stops;
  const done = stops.filter((s) => s.status !== "PENDING").length;
  const pct = stops.length ? Math.round((done / stops.length) * 100) : 0;
  const next = stops.find((s) => s.status === "PENDING");
  const inProgress = route.status === "IN_PROGRESS", draft = route.status === "DRAFT";
  const ask = (msg: string, fn: () => void) => { if (window.confirm(msg)) fn(); };
  const mapPoints = stops.map((s) => ({ id: s.id, n: s.position, label: s.name, lat: s.lat, lng: s.lng, done: s.status !== "PENDING", current: s.id === next?.id }));

  return (
    <div className="space-y-4">
      <section className={`${cardCls} space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={inProgress ? "bg-blue-100 text-blue-800" : route.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : undefined}>{t.status[route.status]}</Badge>
          <span className="text-sm text-slate-600">{route.plannedDate}{route.ownerName && !route.canMutate ? ` · ${route.ownerName}` : ""}</span>
        </div>
        <div>
          <div className="flex items-center justify-between text-sm"><span className="font-medium text-slate-800">{r.progress}</span><span className="text-slate-600">{done} {r.of} {stops.length}</span></div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={stops.length} aria-valuenow={done} aria-label={r.progress}><div className="h-full bg-blue-600" style={{ width: `${pct}%` }} /></div>
        </div>
        {route.estimatedDistanceM !== null && stops.length > 1 && <p className="text-xs text-slate-500"><strong>{t.planner.distance}:</strong> {formatKm(route.estimatedDistanceM)} — {t.planner.distanceNote}</p>}
        {!route.canMutate && <p role="note" className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{t.readOnly}</p>}
        {route.canMutate && draft && (
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} disabled={pending || stops.length === 0} onClick={() => ask(t.planner.startConfirm, () => run(() => startFieldRoute(route.id)))}>{t.planner.start}</button>
            <Link className={btnSecondary} href={`${PLATFORM.salesFieldRoute(route.id)}/edit`}>{t.planner.edit}</Link>
            <button className={btnDanger} disabled={pending} onClick={() => ask(t.planner.cancelConfirm, () => run(() => cancelFieldRoute(route.id), () => router.push(PLATFORM.salesField)))}>{t.planner.cancelRoute}</button>
          </div>
        )}
        <FormMessage error={error} notice={notice ?? null} />
      </section>

      {route.canMutate && inProgress && (
        <section className={`${cardCls} space-y-4 border-blue-200`} aria-labelledby="next-h">
          <h2 id="next-h" className="text-sm font-semibold uppercase tracking-wide text-blue-700">{r.next}</h2>
          {next ? (
            <>
              <div className="min-w-0">
                <p className="break-words text-xl font-semibold text-slate-900">{next.position}. {next.name}</p>
                <p className="mt-0.5 break-words text-sm text-slate-600">{next.address ?? "—"}</p>
              </div>
              {next.blocked ? (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{r.blocked} {t.errors[next.blocked]}</p>
              ) : (
                <>
                  <div>
                    <div className="grid grid-cols-3 gap-2" role="group" aria-label={r.navigateTo}>
                      {NAV_APPS.map((app) => {
                        const href = navigationUrl(app, next.lat, next.lng);
                        return href ? <a key={app} href={href} target="_blank" rel="noopener noreferrer" className={`${app === "google" ? btnPrimary : btnSecondary} min-h-12 px-2 text-center`}><MapPin className="mr-1 hidden h-4 w-4 sm:inline" aria-hidden />{r[app]}</a> : null;
                      })}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{r.navNote}</p>
                  </div>
                  {next.phone && <a href={`tel:${next.phone.replace(/[^0-9+]/g, "")}`} className={`${btnSecondary} w-full sm:w-auto`}><Phone className="mr-2 h-4 w-4" aria-hidden />{r.call}: {next.phone}</a>}
                  <VisitResultForm key={next.id} locale={locale} idPrefix={next.id} submit={(payload) => submitFieldVisit(next.id, payload)} />
                </>
              )}
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <button className={btnSecondary} disabled={pending} onClick={() => ask(r.skipConfirm, () => run(() => skipFieldStop(next.id), undefined, r.skipped))}>{r.skip}</button>
                <Link className={btnSecondary} href={PLATFORM.salesProspect(next.prospectId)}>{r.openProspect}</Link>
              </div>
            </>
          ) : (
            <div className="space-y-3"><p className="text-sm text-slate-700">{r.routeDone}</p>
              <button className={btnPrimary} disabled={pending} onClick={() => run(() => completeFieldRoute(route.id), undefined, r.completed)}>{t.planner.complete}</button></div>
          )}
          {next && <div><button className={btnSecondary} disabled={pending} onClick={() => ask(t.planner.completeConfirm, () => run(() => completeFieldRoute(route.id), undefined, r.completed))}>{t.planner.complete}</button>
            <button className={`${btnDanger} ml-2`} disabled={pending} onClick={() => ask(t.planner.cancelConfirm, () => run(() => cancelFieldRoute(route.id), () => router.push(PLATFORM.salesField)))}>{t.planner.cancelRoute}</button></div>}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${cardCls} min-w-0`} aria-labelledby="stops-h">
          <h2 id="stops-h" className="mb-3 font-semibold text-slate-900">{t.planner.selected}</h2>
          {stops.length === 0 ? <p className="text-sm text-slate-600">{t.planner.noSelected}</p> : (
            <ol className="space-y-2">
              {stops.map((s) => (
                <li key={s.id} className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${s.id === next?.id && inProgress ? "border-blue-300 bg-blue-50" : "border-slate-200"}`}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white" aria-hidden>{s.position}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium text-slate-900">{s.name}</span>
                    <span className="block break-words text-xs text-slate-500">{s.address ?? "—"}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={tone[s.status]}>{t.stopStatus[s.status]}</Badge>
                      {s.outcome && <Badge>{t.outcomes[s.outcome]}</Badge>}
                      {s.blocked && <Badge tone="bg-rose-100 text-rose-800">{t.errors[s.blocked]}</Badge>}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className={`${cardCls} min-w-0`}><RouteMap points={mapPoints} config={mapConfig} t={t.map} /></section>
      </div>
    </div>
  );
}
