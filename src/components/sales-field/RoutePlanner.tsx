"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { requestGeocoding, saveFieldRoute } from "@/actions/sales-field";
import { MAX_ROUTE_STOPS, formatKm, lengthOfOrder, optimizeRoute } from "@/domain/sales-crm/route-optimizer";
import { fieldCopy } from "@/lib/admin-locale/sales-field";
import { PLATFORM } from "@/lib/routes";
import { Badge, btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";
import { RouteMap, type MapConfig } from "@/components/sales-field/RouteMap";

export interface PlannerCandidate {
  id: string; name: string; city: string | null; address: string | null; territoryKey: string | null; stage: string | null;
  location: { usable: true; lat: number; lng: number } | { usable: false; reason: string };
  plannedElsewhere: boolean;
}
export interface PlannerProps {
  locale: "en" | "fr"; candidates: PlannerCandidate[]; territories: { key: string; name: string }[];
  geocoding: { mode: string; reason: string }; mapConfig: MapConfig | null;
  initial: { routeId?: string; version?: number; plannedDate: string; name: string; selectedIds: string[] };
}

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "-");

export function RoutePlanner({ locale, candidates, territories, geocoding, mapConfig, initial }: PlannerProps) {
  const t = fieldCopy(locale), p = t.planner;
  const router = useRouter();
  const { pending, error, notice, run, setError } = useCrmAction(locale);
  const [date, setDate] = useState(initial.plannedDate);
  const [name, setName] = useState(initial.name);
  const [city, setCity] = useState(""), [area, setArea] = useState(""), [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>(initial.selectedIds);
  const [requestId] = useState(newId);
  const [info, setInfo] = useState<string | null>(null);
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const cities = useMemo(() => [...new Set(candidates.map((c) => c.city).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)), [candidates]);
  const shown = candidates.filter((c) => (!city || c.city === city) && (!area || c.territoryKey === area) && (!q || c.name.toLowerCase().includes(q.toLowerCase())));
  const selectedRows = selected.map((id) => byId.get(id)).filter((c): c is PlannerCandidate => !!c);
  const points = selectedRows.flatMap((c) => (c.location.usable ? [{ id: c.id, lat: c.location.lat, lng: c.location.lng }] : []));
  const distanceM = points.length > 1 ? lengthOfOrder(points, selected) : 0;
  const unlocated = candidates.filter((c) => !c.location.usable);

  function toggle(id: string) { setInfo(null); setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_ROUTE_STOPS ? s : [...s, id])); }
  function move(i: number, d: -1 | 1) { setInfo(null); setSelected((s) => { const j = i + d; if (j < 0 || j >= s.length) return s; const n = [...s]; [n[i], n[j]] = [n[j], n[i]]; return n; }); }
  function suggest() {
    if (points.length < 2) return;
    setSelected(optimizeRoute(points, selected[0]).order);
    setInfo(p.suggested);
  }
  function save() {
    run(() => saveFieldRoute({ routeId: initial.routeId, expectedVersion: initial.version, clientRequestId: requestId, plannedDate: date, name, prospectIds: selected }), (r) => router.push(PLATFORM.salesFieldRoute(r.routeId)), p.saved);
  }
  function locate() {
    setError(null); setInfo(null);
    run(() => requestGeocoding(unlocated.slice(0, 25).map((c) => c.id)), (r) => {
      const counts = new Map<string, number>(); for (const x of r.results) counts.set(x.outcome, (counts.get(x.outcome) ?? 0) + 1);
      setInfo(`${p.located} ${[...counts].map(([k, v]) => `${v} ${t.geocoding.outcomes[k] ?? k}`).join(", ")}`);
    });
  }
  const mapPoints = selectedRows.flatMap((c, i) => (c.location.usable ? [{ id: c.id, n: i + 1, label: c.name, lat: c.location.lat, lng: c.location.lng }] : []));

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      <div role="note" className={`rounded-lg px-3 py-2 text-sm ${geocoding.mode === "SYNTHETIC" ? "bg-violet-50 text-violet-900" : "bg-amber-50 text-amber-900"}`}>
        <strong>{t.geocoding.title}: </strong>{t.geocoding[geocoding.mode as "DISABLED"]} {t.geocoding[geocoding.reason as "NO_PROVIDER_CONFIGURED"]}
      </div>

      <section className={`${cardCls} grid gap-3 sm:grid-cols-2`} aria-label={t.newRoute}>
        <label className={labelCls}>{p.date}<input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required /></label>
        <label className={labelCls}>{p.name}<input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${cardCls} min-w-0 space-y-3`} aria-labelledby="cand-h">
          <h2 id="cand-h" className="font-semibold text-slate-900">{p.candidates} <span className="text-sm font-normal text-slate-500">({shown.length})</span></h2>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className={labelCls}>{p.city}<select className={inputCls} value={city} onChange={(e) => setCity(e.target.value)}><option value="">{p.allCities}</option>{cities.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            <label className={labelCls}>{p.area}<select className={inputCls} value={area} onChange={(e) => setArea(e.target.value)}><option value="">{p.allAreas}</option>{territories.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select></label>
            <label className={labelCls}>{p.search}<input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} type="search" /></label>
          </div>
          {unlocated.length > 0 && geocoding.mode === "SYNTHETIC" && (
            <button type="button" className={btnSecondary} onClick={locate} disabled={pending}>{pending ? p.locating : p.locate} ({Math.min(unlocated.length, 25)})</button>
          )}
          {shown.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">{p.noCandidates}</p> : (
            <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {shown.map((c) => {
                const checked = selected.includes(c.id), usable = c.location.usable, full = !checked && selected.length >= MAX_ROUTE_STOPS;
                return (
                  <li key={c.id}>
                    <label className={`flex min-h-14 cursor-pointer items-start gap-3 px-3 py-2 ${!usable || full ? "opacity-60" : "hover:bg-slate-50"}`}>
                      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={checked} disabled={(!usable || full) && !checked} onChange={() => toggle(c.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-medium text-slate-900">{c.name}</span>
                        <span className="block break-words text-xs text-slate-500">{[c.address, c.city].filter(Boolean).join(", ") || "—"}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {!c.location.usable && <Badge tone="bg-amber-100 text-amber-900">{p.locationReason[c.location.reason] ?? p.needsLocation}</Badge>}
                          {c.plannedElsewhere && <Badge tone="bg-sky-100 text-sky-800">{p.plannedElsewhere}</Badge>}
                          {c.stage && <Badge>{c.stage}</Badge>}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={`${cardCls} min-w-0 space-y-3`} aria-labelledby="sel-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="sel-h" className="font-semibold text-slate-900">{p.selected} <span className="text-sm font-normal text-slate-500">({selected.length}/{MAX_ROUTE_STOPS})</span></h2>
            <button type="button" className={btnSecondary} onClick={suggest} disabled={points.length < 2}>{p.suggest}</button>
          </div>
          <p className="text-xs text-slate-500">{p.suggestHelp}</p>
          {selected.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">{p.noSelected}</p> : (
            <ol className="space-y-2">
              {selectedRows.map((c, i) => (
                <li key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white" aria-hidden>{i + 1}</span>
                  <span className="min-w-0 flex-1 break-words text-sm font-medium text-slate-900">{c.name}<span className="block text-xs font-normal text-slate-500">{c.city}</span></span>
                  <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 disabled:opacity-40" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${p.moveUp}: ${c.name}`}><ArrowUp className="h-4 w-4" aria-hidden /></button>
                  <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 disabled:opacity-40" onClick={() => move(i, 1)} disabled={i === selectedRows.length - 1} aria-label={`${p.moveDown}: ${c.name}`}><ArrowDown className="h-4 w-4" aria-hidden /></button>
                  <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-red-200 text-red-700" onClick={() => toggle(c.id)} aria-label={`${p.remove}: ${c.name}`}><X className="h-4 w-4" aria-hidden /></button>
                </li>
              ))}
            </ol>
          )}
          {points.length > 1 && (
            <p className="text-sm text-slate-700"><strong>{p.distance}:</strong> {formatKm(distanceM)} <span className="block text-xs text-slate-500">{p.distanceNote}</span></p>
          )}
          <RouteMap points={mapPoints} config={mapConfig} t={t.map} />
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <button type="button" className={`${btnPrimary} min-w-40`} onClick={save} disabled={pending || !date}>{pending ? p.saving : p.save}</button>
          <span className="text-sm text-slate-600">{selected.length} {p.selectedCount}</span>
          <div className="min-w-0 flex-1"><FormMessage error={error} notice={notice ?? info} /></div>
        </div>
      </div>
    </div>
  );
}
