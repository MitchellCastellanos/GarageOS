"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Crosshair, MapPin, Phone, Search, X } from "lucide-react";
import { loadFieldMapViewport, loadFieldNearby, loadFieldProspect, saveFieldRoute, searchFieldPlace, submitMapVisit } from "@/actions/sales-field";
import { CANADA_BBOX, MAP_STATUSES, RADIUS_CHOICES_M, STATUS_COLOR, type Bbox, type Cluster, type MapPointDto, type MapStatus } from "@/domain/sales-crm/field-map";
import { navigationUrl, NAV_APPS } from "@/domain/sales-crm/navigation";
import { MAX_ROUTE_STOPS, formatKm, lengthOfOrder, optimizeRoute } from "@/domain/sales-crm/route-optimizer";
import { fieldCopy } from "@/lib/admin-locale/sales-field";
import { workspaceCopy } from "@/lib/admin-locale/sales-field-workspace";
import { PLATFORM } from "@/lib/routes";
import type { MapProspectDetail, TerritorySummary } from "@/lib/sales-crm/field-map-service";
import { Badge, btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";
import type { MapConfig } from "@/components/sales-field/RouteMap";
import { TerritoryMap, type FlyTo, type MapViewport } from "@/components/sales-field/TerritoryMap";
import { VisitResultForm } from "@/components/sales-field/VisitResultForm";

export interface PlannedStop { id: string; name: string; city: string | null; lat: number; lng: number }
export interface WorkspaceProps {
  locale: "en" | "fr"; mapConfig: MapConfig | null; summary: TerritorySummary; canRecord: boolean;
  initial: { routeId?: string; version?: number; plannedDate: string; name: string; stops: PlannedStop[] };
}
type Viewport = { counts: { inView: number; matching: number; byStatus: Record<MapStatus, number>; truncated: boolean }; points: MapPointDto[]; clusters: Cluster[]; mode: "points" | "clusters" };
type Near = { points: (MapPointDto & { distanceM: number })[]; totalInRadius: number };

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "-");
const CANADA_VIEW: MapViewport = { bbox: CANADA_BBOX, zoom: 22 };
const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export function FieldWorkspace({ locale, mapConfig, summary, canRecord, initial }: WorkspaceProps) {
  const t = fieldCopy(locale), p = t.planner, w = workspaceCopy(locale);
  const router = useRouter();
  const { pending, error, notice, run } = useCrmAction(locale);

  const [date, setDate] = useState(initial.plannedDate), [name, setName] = useState(initial.name);
  const [requestId] = useState(newId);
  const [stops, setStops] = useState<PlannedStop[]>(initial.stops);
  const [statuses, setStatuses] = useState<MapStatus[]>([]), [q, setQ] = useState(""), [qApplied, setQApplied] = useState("");
  const [view, setView] = useState<MapViewport | null>(mapConfig ? null : CANADA_VIEW);
  const [data, setData] = useState<Viewport | null>(null), [loading, setLoading] = useState(false), [loadErr, setLoadErr] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null), [detail, setDetail] = useState<MapProspectDetail | null>(null), [detailErr, setDetailErr] = useState(false), [showForm, setShowForm] = useState(false), [recorded, setRecorded] = useState(false);
  const [you, setYou] = useState<{ lat: number; lng: number } | null>(null), [geoMsg, setGeoMsg] = useState<string | null>(null), [locating, setLocating] = useState(false);
  const [radiusM, setRadiusM] = useState<number>(5000), [near, setNear] = useState<Near | null>(null), [placeQ, setPlaceQ] = useState(""), [placeMsg, setPlaceMsg] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTo | null>(null);
  const reqSeq = useRef(0);

  // Debounce the name search so typing does not hammer the server.
  useEffect(() => { const id = setTimeout(() => setQApplied(q.trim()), 350); return () => clearTimeout(id); }, [q]);

  // Viewport load: only the newest request may update the screen.
  useEffect(() => {
    if (!view) return;
    const seq = ++reqSeq.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the loading flag belongs to this fetch
    setLoading(true);
    loadFieldMapViewport({ bbox: view.bbox, zoom: view.zoom, statuses, q: qApplied || undefined }).then((r) => {
      if (seq !== reqSeq.current) return;
      if (r.ok) { setData(r as unknown as Viewport); setLoadErr(false); } else setLoadErr(true);
    }).catch(() => { if (seq === reqSeq.current) setLoadErr(true); }).finally(() => { if (seq === reqSeq.current) setLoading(false); });
  }, [view, statuses, qApplied, refreshTick]);

  const loadDetail = useCallback((id: string) => {
    setDetailErr(false);
    loadFieldProspect(id).then((r) => { if (r.ok) setDetail(r as unknown as MapProspectDetail); else setDetailErr(true); }).catch(() => setDetailErr(true));
  }, []);
  function select(id: string) { setSelectedId(id); setDetail(null); setShowForm(false); setRecorded(false); loadDetail(id); }
  function closePanel() { setSelectedId(null); setDetail(null); setShowForm(false); setRecorded(false); }

  const inRoute = (id: string) => stops.some((s) => s.id === id);
  function addStop() {
    if (!detail || detail.lat === null || detail.lng === null || inRoute(detail.id) || stops.length >= MAX_ROUTE_STOPS || detail.blocked) return;
    setStops((s) => [...s, { id: detail.id, name: detail.name, city: detail.city, lat: detail.lat!, lng: detail.lng! }]);
  }
  const removeStop = (id: string) => setStops((s) => s.filter((x) => x.id !== id));
  function move(i: number, d: -1 | 1) { setStops((s) => { const j = i + d; if (j < 0 || j >= s.length) return s; const n = [...s]; [n[i], n[j]] = [n[j], n[i]]; return n; }); }
  function suggest() { if (stops.length < 2) return; const order = optimizeRoute(stops, stops[0].id).order; setStops((s) => order.map((id) => s.find((x) => x.id === id)!)); }
  function save() { run(() => saveFieldRoute({ routeId: initial.routeId, expectedVersion: initial.version, clientRequestId: requestId, plannedDate: date, name, prospectIds: stops.map((s) => s.id) }), (r) => router.push(PLATFORM.salesFieldRoute(r.routeId)), p.saved); }
  const distanceM = stops.length > 1 ? lengthOfOrder(stops, stops.map((s) => s.id)) : 0;

  const toggleStatus = (s: MapStatus) => setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const filtered = statuses.length > 0 || qApplied !== "";
  function reset() { setStatuses([]); setQ(""); setQApplied(""); }

  function nearMe() {
    setGeoMsg(null);
    if (!("geolocation" in navigator)) { setGeoMsg(w.where.denied); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setLocating(false); setYou(c); setFlyTo({ key: newId(), center: c, zoom: 14 }); runNearby(c, radiusM); },
      () => { setLocating(false); setGeoMsg(w.where.denied); },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }
  function runNearby(c: { lat: number; lng: number }, r: number) {
    loadFieldNearby({ lat: c.lat, lng: c.lng, radiusM: r, statuses }).then((res) => { if (res.ok) setNear(res as unknown as Near); }).catch(() => {});
  }
  // Re-run the nearby search for a new radius or filter only (not on every render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (you) runNearby(you, radiusM); }, [radiusM, statuses]);
  async function goPlace() {
    setPlaceMsg(null);
    const r = await searchFieldPlace(placeQ).catch(() => null);
    if (!r || !r.ok || !("place" in r) || !r.place) { setPlaceMsg(w.where.noPlace); return; }
    const place = r.place as { center: { lat: number; lng: number }; bbox: Bbox };
    setYou(place.center); setFlyTo({ key: newId(), bbox: place.bbox }); runNearby(place.center, radiusM);
  }

  const stopMarkers = useMemo(() => stops.map((s, i) => ({ id: s.id, n: i + 1, label: s.name, lat: s.lat, lng: s.lng, status: data?.points.find((x) => x.id === s.id)?.status })), [stops, data]);
  const mapT = useMemo(() => ({ ...w.map }), [w]);
  const counts = data?.counts;
  const listPoints = (data?.points ?? []).slice(0, 50);

  return (
    <div className="space-y-4 pb-40 lg:pb-4">
      <section className={`${cardCls} space-y-3`} aria-label={w.filters}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{w.filters}</h2>
          <button type="button" className={`${btnSecondary} min-h-11`} onClick={reset} disabled={!filtered}>{w.resetFilters}</button>
        </div>
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap" role="group" aria-label={w.legend}>
          {MAP_STATUSES.map((s) => {
            const on = statuses.includes(s);
            return (
              <li key={s} className="shrink-0">
                <button type="button" aria-pressed={on} title={w.statusHelp[s]} onClick={() => toggleStatus(s)}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-3 text-sm font-medium ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-800"}`}>
                  <span className="h-3.5 w-3.5 rounded-full border border-white" style={{ backgroundColor: STATUS_COLOR[s] }} aria-hidden />
                  {w.statuses[s]}{counts ? <span className={on ? "text-slate-300" : "text-slate-500"}>{counts.byStatus[s]}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-slate-500">{statuses.length ? "" : w.allStatuses}</p>
        <label className={labelCls}>{w.searchName}<input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} type="search" maxLength={80} /></label>
      </section>

      <section className={`${cardCls} space-y-3`} aria-label={w.where.title}>
        <h2 className="text-sm font-semibold text-slate-900">{w.where.title}</h2>
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" className={`${btnSecondary} min-h-12`} onClick={nearMe} disabled={locating}><Crosshair className="mr-2 h-4 w-4" aria-hidden />{locating ? w.where.locating : w.where.nearMe}</button>
          <form className="flex min-w-0 flex-1 items-end gap-2" onSubmit={(e) => { e.preventDefault(); void goPlace(); }}>
            <label className={`${labelCls} min-w-0 flex-1`}>{w.where.place}<input className={inputCls} value={placeQ} onChange={(e) => setPlaceQ(e.target.value)} maxLength={80} /></label>
            <button className={`${btnSecondary} min-h-12`} disabled={placeQ.trim().length < 2}><Search className="mr-1 h-4 w-4" aria-hidden />{w.where.go}</button>
          </form>
          <label className={labelCls}>{w.where.radius}
            <select className={inputCls} value={radiusM} onChange={(e) => setRadiusM(Number(e.target.value))}>{RADIUS_CHOICES_M.map((r) => <option key={r} value={r}>{r / 1000} {w.where.km}</option>)}</select>
          </label>
        </div>
        <p className="text-xs text-slate-500">{w.where.nearMeHelp} {w.where.placeNote}</p>
        {(geoMsg || placeMsg) && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{geoMsg ?? placeMsg}</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className={`${cardCls} min-w-0 space-y-2`} aria-label={w.map.title}>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 sm:grid-cols-5" aria-live="polite">
            <div><dt className="inline">{w.counts.territory}: </dt><dd className="inline font-semibold text-slate-900">{summary.total}</dd></div>
            <div><dt className="inline">{w.counts.located}: </dt><dd className="inline font-semibold text-slate-900">{summary.located}</dd></div>
            <div><dt className="inline">{w.counts.inView}: </dt><dd className="inline font-semibold text-slate-900">{counts?.inView ?? "…"}</dd></div>
            <div><dt className="inline">{w.counts.matching}: </dt><dd className="inline font-semibold text-slate-900">{counts?.matching ?? "…"}</dd></div>
            <div><dt className="inline">{w.counts.stops}: </dt><dd className="inline font-semibold text-slate-900">{stops.length}/{MAX_ROUTE_STOPS}</dd></div>
          </dl>
          {loading && <p className="text-xs text-slate-500" role="status">{w.counts.loading}</p>}
          {loadErr && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">{w.counts.failed}</p>}
          {counts?.truncated && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{w.counts.truncated}</p>}
          {mapConfig ? (
            <TerritoryMap config={mapConfig} points={data?.points ?? []} clusters={data?.clusters ?? []} stops={stopMarkers} selectedId={selectedId} you={you} flyTo={flyTo}
              onViewport={setView} onSelect={select} t={mapT} />
          ) : <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{w.list.noMap}</p>}
          {data?.mode === "clusters" && <p className="text-xs text-slate-500">{w.counts.zoomIn}</p>}
        </section>

        <aside className="min-w-0 space-y-4">
          {selectedId && (
            <section className={`${cardCls} space-y-3 max-lg:fixed max-lg:inset-x-2 max-lg:bottom-20 max-lg:z-30 max-lg:max-h-[68vh] max-lg:overflow-y-auto max-lg:shadow-2xl`} aria-label={detail?.name ?? w.panel.loading}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-semibold text-slate-900">{detail?.name ?? w.panel.loading}</h2>
                  {detail && <p className="break-words text-sm text-slate-600">{detail.address ?? "—"}</p>}
                </div>
                <button type="button" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300" onClick={closePanel} aria-label={w.panel.close}><X className="h-4 w-4" aria-hidden /></button>
              </div>
              {detailErr && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{t.errors.NOT_ASSIGNED_TO_OWNER}</p>}
              {detail && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="bg-slate-100 text-slate-800"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[detail.status] }} aria-hidden />{w.statuses[detail.status]}</Badge>
                    {inRoute(detail.id) && <Badge tone="bg-blue-100 text-blue-900">{w.panel.inRoute}</Badge>}
                  </div>
                  <p className="text-sm text-slate-700">
                    <strong>{w.panel.lastVisit}:</strong> {detail.lastVisit ? `${t.outcomes[detail.lastVisit.outcome] ?? detail.lastVisit.outcome} · ${detail.lastVisit.at.slice(0, 10)}` : w.panel.never}
                    {detail.nextTask && <><br /><strong>{w.panel.nextTask}:</strong> {detail.nextTask.title} · {detail.nextTask.dueAt.slice(0, 10)}</>}
                  </p>
                  {detail.blocked && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{w.panel.blocked} {t.errors[detail.blocked]}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    {inRoute(detail.id)
                      ? <button type="button" className={`${btnSecondary} min-h-12`} onClick={() => removeStop(detail.id)}>{w.panel.removeFromRoute}</button>
                      : <button type="button" className={`${btnPrimary} min-h-12`} onClick={addStop} disabled={detail.lat === null || !!detail.blocked || stops.length >= MAX_ROUTE_STOPS}>{w.panel.addToRoute}</button>}
                    {detail.phone ? <a href={`tel:${detail.phone.replace(/[^0-9+]/g, "")}`} className={`${btnSecondary} min-h-12`}><Phone className="mr-2 h-4 w-4" aria-hidden />{w.panel.call}</a> : <Link className={`${btnSecondary} min-h-12`} href={PLATFORM.salesProspect(detail.id)}>{w.panel.openProspect}</Link>}
                  </div>
                  {!inRoute(detail.id) && stops.length >= MAX_ROUTE_STOPS && <p className="text-xs text-slate-600">{w.panel.routeFull}</p>}
                  {detail.lat !== null && detail.lng !== null && (
                    <div className="grid grid-cols-3 gap-2" role="group" aria-label={w.panel.navigate}>
                      {NAV_APPS.map((app) => { const href = navigationUrl(app, detail.lat!, detail.lng!); return href ? <a key={app} href={href} target="_blank" rel="noopener noreferrer" className={`${btnSecondary} min-h-12 px-2 text-center`}><MapPin className="mr-1 hidden h-4 w-4 sm:inline" aria-hidden />{t.run[app]}</a> : null; })}
                    </div>
                  )}
                  {canRecord && !detail.blocked && (
                    <div className="space-y-2 border-t border-slate-100 pt-3">
                      {detail.activeStopId && <p className="text-xs text-blue-800">{w.panel.activeStop}</p>}
                      {recorded && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{w.panel.recorded}</p>}
                      <button type="button" className={`${btnSecondary} min-h-12 w-full`} onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>{showForm ? w.panel.hideResult : w.panel.recordResult}</button>
                      {showForm && (
                        <VisitResultForm key={detail.id + (recorded ? "r" : "")} locale={locale} idPrefix={`map-${detail.id}`} submit={(payload) => submitMapVisit(detail.id, payload)}
                          onDone={() => { setRecorded(true); setShowForm(false); loadDetail(detail.id); setRefreshTick((x) => x + 1); }} />
                      )}
                    </div>
                  )}
                  <Link className="inline-flex min-h-11 items-center text-sm text-blue-700" href={PLATFORM.salesProspect(detail.id)}>{w.panel.openProspect} →</Link>
                </>
              )}
            </section>
          )}

          <section className={`${cardCls} min-w-0 space-y-3`} aria-labelledby="route-h">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="route-h" className="font-semibold text-slate-900">{w.route.title} <span className="text-sm font-normal text-slate-500">({stops.length}/{MAX_ROUTE_STOPS})</span></h2>
              <button type="button" className={`${btnSecondary} min-h-11`} onClick={suggest} disabled={stops.length < 2}>{w.route.suggest}</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={labelCls}>{p.date}<input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required /></label>
              <label className={labelCls}>{p.name}<input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
            </div>
            {stops.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-600">{w.route.empty}</p> : (
              <ol className="space-y-2">
                {stops.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2">
                    <button type="button" onClick={() => select(s.id)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white" aria-hidden>{i + 1}</span>
                      <span className="min-w-0 break-words text-sm font-medium text-slate-900">{s.name}<span className="block text-xs font-normal text-slate-500">{s.city}</span></span>
                    </button>
                    <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 disabled:opacity-40" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${p.moveUp}: ${s.name}`}><ArrowUp className="h-4 w-4" aria-hidden /></button>
                    <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 disabled:opacity-40" onClick={() => move(i, 1)} disabled={i === stops.length - 1} aria-label={`${p.moveDown}: ${s.name}`}><ArrowDown className="h-4 w-4" aria-hidden /></button>
                    <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-red-200 text-red-700" onClick={() => removeStop(s.id)} aria-label={`${p.remove}: ${s.name}`}><X className="h-4 w-4" aria-hidden /></button>
                  </li>
                ))}
              </ol>
            )}
            {stops.length > 1 && <p className="text-sm text-slate-700"><strong>{p.distance}:</strong> {formatKm(distanceM)} <span className="block text-xs text-slate-500">{p.distanceNote}</span></p>}
          </section>

          {near && you && (
            <section className={`${cardCls} space-y-2`} aria-label={w.where.nearby}>
              <h2 className="text-sm font-semibold text-slate-900">{w.where.nearby} <span className="font-normal text-slate-500">({near.totalInRadius} {w.where.nearbyOf})</span></h2>
              {near.points.length === 0 ? <p className="text-sm text-slate-600">{w.where.nearbyNone}</p> : (
                <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {near.points.map((x) => (
                    <li key={x.id}><button type="button" className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left" onClick={() => { select(x.id); setFlyTo({ key: newId(), center: x, zoom: 16 }); }}>
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLOR[x.status] }} aria-hidden />
                      <span className="min-w-0 flex-1 break-words text-sm font-medium text-slate-900">{x.name}</span>
                      <span className="shrink-0 text-xs text-slate-500">{fmtDist(x.distanceM)}</span>
                    </button></li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </aside>
      </div>

      <section className={`${cardCls} space-y-2`} aria-labelledby="list-h">
        <h2 id="list-h" className="font-semibold text-slate-900">{w.list.title} <span className="text-sm font-normal text-slate-500">({w.list.showing} {listPoints.length} {w.list.of} {counts?.matching ?? 0})</span></h2>
        {listPoints.length === 0 ? <p className="text-sm text-slate-600">{w.list.none}</p> : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {listPoints.map((x) => (
              <li key={x.id}><button type="button" className="flex min-h-12 w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left" onClick={() => { select(x.id); setFlyTo({ key: newId(), center: x, zoom: 16 }); }}>
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLOR[x.status] }} aria-hidden />
                <span className="min-w-0 flex-1 break-words text-sm font-medium text-slate-900">{x.name}<span className="block text-xs font-normal text-slate-500">{x.city} · {w.statuses[x.status]}</span></span>
                {inRoute(x.id) && <Badge tone="bg-blue-100 text-blue-900">{w.panel.inRoute}</Badge>}
              </button></li>
            ))}
          </ul>
        )}
      </section>

      {summary.total > summary.located && (
        <section className={`${cardCls} space-y-2`} aria-labelledby="unl-h">
          <h2 id="unl-h" className="font-semibold text-slate-900">{w.unlocated.title} <span className="text-sm font-normal text-slate-500">({summary.total - summary.located})</span></h2>
          <p className="text-xs text-slate-500">{w.unlocated.intro}</p>
          <ul className="flex flex-wrap gap-1.5 text-xs">
            {(["PENDING", "AMBIGUOUS_FAILED", "INSUFFICIENT_ADDRESS"] as const).map((k) => <li key={k}><Badge tone={k === "PENDING" ? "bg-sky-100 text-sky-900" : "bg-amber-100 text-amber-900"}>{w.unlocated.reasons[k]}: {summary.coverage[k]}</Badge></li>)}
          </ul>
          <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {summary.unlocatedSample.map((u) => (
              <li key={u.id} className="flex items-start gap-2 px-3 py-2"><span className="min-w-0 flex-1 break-words text-sm text-slate-900">{u.name}<span className="block text-xs text-slate-500">{[u.address, u.city].filter(Boolean).join(", ") || "—"}</span></span><Badge>{w.unlocated.reasons[u.coverage]}</Badge></li>
            ))}
          </ul>
          {summary.total - summary.located > summary.unlocatedSample.length && <p className="text-xs text-slate-500">+ {summary.total - summary.located - summary.unlocatedSample.length} {w.unlocated.more}</p>}
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <button type="button" className={`${btnPrimary} min-h-12 min-w-40`} onClick={save} disabled={pending || !date}>{pending ? p.saving : w.route.save}</button>
          <span className="text-sm text-slate-600">{stops.length}/{MAX_ROUTE_STOPS} {p.selectedCount}</span>
          <div className="min-w-0 flex-1"><FormMessage error={error} notice={notice} /></div>
        </div>
      </div>
    </div>
  );
}
