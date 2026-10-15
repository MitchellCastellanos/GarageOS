"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldCopy } from "@/lib/admin-locale/sales-field";

export interface MapPoint { id: string; n: number; label: string; lat: number; lng: number; done?: boolean; current?: boolean }
/** Either a hosted style (`styleUrl`) or raster tiles (`rasterTiles`, e.g. Mapbox) — both drawn by MapLibre. The attribution is mandatory. */
export interface MapConfig { styleUrl?: string; rasterTiles?: string[]; tileSize?: number; attribution: string }
/** A located prospect that is NOT (yet) a route stop: shown as a grey marker; picking it adds it to the route. */
export interface BackgroundPoint { id: string; label: string; lat: number; lng: number }

const W = 320, H = 220, PAD = 22;

/** Always-available plot of the stops' relative positions. It is labelled as schematic: it is not a map and has no basemap. */
function SchematicPlot({ points, background = [], t }: { points: MapPoint[]; background?: BackgroundPoint[]; t: FieldCopy["map"] }) {
  if (!points.length && !background.length) return null;
  const all = [...points, ...background];
  const lats = all.map((p) => p.lat), lngs = all.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2, kx = Math.cos((midLat * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * kx, 1e-6), spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
  const ox = (W - spanX * scale) / 2, oy = (H - spanY * scale) / 2;
  const pos = (p: { lat: number; lng: number }) => ({ x: ox + (p.lng - minLng) * kx * scale, y: oy + (maxLat - p.lat) * scale });
  const pts = points.map((p) => ({ p, ...pos(p) }));
  const bg = background.map((b) => ({ b, ...pos(b) }));
  return (
    <figure className="min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.plotLabel} className="h-auto w-full rounded-lg border border-slate-200 bg-slate-50">
        {bg.map(({ b, x, y }) => <circle key={b.id} cx={x} cy={y} r={4} fill="#cbd5e1" stroke="#fff" strokeWidth="1"><title>{b.label}</title></circle>)}
        <polyline fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" points={pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")} />
        {pts.map(({ p, x, y }) => (
          <g key={p.id}>
            <circle cx={x} cy={y} r={11} fill={p.current ? "#2563eb" : p.done ? "#94a3b8" : "#1e293b"} stroke="#fff" strokeWidth="2" />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">{p.n}</text>
            <title>{`${t.stopLabel} ${p.n}: ${p.label}`}</title>
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 text-xs text-slate-500">{t.schematic}</figcaption>
    </figure>
  );
}

/** Style for MapLibre: a hosted style URL, or a single raster source (Mapbox static tiles). */
function styleFor(config: MapConfig): string | import("maplibre-gl").StyleSpecification {
  if (config.rasterTiles?.length) {
    return { version: 8, sources: { base: { type: "raster", tiles: config.rasterTiles, tileSize: config.tileSize ?? 256, maxzoom: 22 } }, layers: [{ id: "base", type: "raster", source: "base" }] };
  }
  return config.styleUrl ?? "";
}

/** Lazy MapLibre map, mounted only when an approved basemap + attribution are configured (server-side env). The map is created ONCE
 * per configuration; markers are refreshed in place, so ticking prospects never re-downloads tiles. */
function LiveMap({ points, background, onPick, onViewChange, onFailed, tall, config, t }: { points: MapPoint[]; background: BackgroundPoint[]; onPick?: (id: string) => void; onViewChange?: (ids: string[]) => void; onFailed?: () => void; tall?: boolean; config: MapConfig; t: FieldCopy["map"] }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef<import("maplibre-gl").Marker[]>([]);
  const pick = useRef(onPick);
  const fitted = useRef("");
  const [ready, setReady] = useState(false), [lineReady, setLineReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const viewCb = useRef(onViewChange), lastView = useRef<string | null>(null), renderRef = useRef<() => void>(() => {});
  const failedCb = useRef(onFailed);
  useEffect(() => { pick.current = onPick; viewCb.current = onViewChange; failedCb.current = onFailed; }, [onPick, onViewChange, onFailed]);
  useEffect(() => { if (failed) failedCb.current?.(); }, [failed]);
  const cfgKey = `${config.styleUrl ?? ""}|${(config.rasterTiles ?? []).join(",")}|${config.attribution}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        await import("maplibre-gl/dist/maplibre-gl.css");
        if (cancelled || !el.current) return;
        maplibre.setWorkerUrl("/maplibre-gl-worker.mjs"); // copied to /public at install/build time (scripts/copy-maplibre-worker.mjs)
        const m = new maplibre.Map({ container: el.current, style: styleFor(config), attributionControl: { customAttribution: config.attribution, compact: false }, cooperativeGestures: true, center: [-73.57, 45.5], zoom: 9 });
        libRef.current = maplibre; mapRef.current = m;
        m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        m.on("error", () => { if (!cancelled) setFailed(true); });
        m.on("moveend", () => renderRef.current());
        m.on("load", () => {
          if (cancelled) return;
          m.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          m.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 } });
          m.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#1e293b", "line-width": 3 } });
          setLineReady(true);
        });
        setReady(true);
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; markers.current.forEach((x) => x.remove()); markers.current = []; mapRef.current?.remove(); mapRef.current = null; setReady(false); setLineReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `cfgKey` captures every config input that matters
  }, [cfgKey]);

  const pointsKey = points.map((p) => `${p.id}:${p.lat}:${p.lng}:${p.n}:${p.current ? 1 : 0}:${p.done ? 1 : 0}`).join("|");
  const bgKey = background.map((b) => `${b.id}:${b.lat}:${b.lng}`).join("|");

  // Draws route stops (numbered, never merged) and the other located prospects, merged into count bubbles when they are close on screen.
  // Called on every pan/zoom, so what is on the map — and what the parent shows in its list — always matches the visible area.
  useEffect(() => { renderRef.current = () => {
    const m = mapRef.current, lib = libRef.current;
    if (!ready || !m || !lib) return;
    markers.current.forEach((x) => x.remove()); markers.current = [];
    const bounds = m.getBounds(), zoom = m.getZoom();
    const inView = background.filter((b) => bounds.contains([b.lng, b.lat]));
    const key = inView.map((b) => b.id).sort().join("|");
    if (key !== lastView.current) { lastView.current = key; viewCb.current?.(inView.map((b) => b.id)); }

    const CELL = 64; // px: prospects closer than this on screen share one bubble
    const cells = new Map<string, BackgroundPoint[]>();
    for (const b of inView) {
      const px = m.project([b.lng, b.lat]);
      const k = zoom >= 16 ? b.id : `${Math.floor(px.x / CELL)}:${Math.floor(px.y / CELL)}`;
      const g = cells.get(k); if (g) g.push(b); else cells.set(k, [b]);
    }
    for (const group of cells.values()) {
      if (group.length === 1) {
        const b = group[0];
        const node = document.createElement("button");
        node.type = "button";
        node.setAttribute("aria-label", `${t.addPoint}: ${b.label}`);
        node.title = b.label;
        node.className = "h-6 w-6 rounded-full border-2 border-white bg-slate-400 shadow hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500";
        node.addEventListener("click", () => pick.current?.(b.id));
        markers.current.push(new lib.Marker({ element: node }).setLngLat([b.lng, b.lat]).addTo(m));
        continue;
      }
      const lng = group.reduce((a, b) => a + b.lng, 0) / group.length, lat = group.reduce((a, b) => a + b.lat, 0) / group.length;
      const size = group.length < 10 ? 34 : group.length < 50 ? 42 : 52;
      const node = document.createElement("button");
      node.type = "button";
      node.textContent = String(group.length);
      node.setAttribute("aria-label", `${group.length} ${t.clusterLabel}`);
      node.title = `${group.length} ${t.clusterLabel}`;
      node.style.width = node.style.height = `${size}px`;
      node.className = "flex items-center justify-center rounded-full border-2 border-white bg-blue-600/90 text-sm font-semibold text-white shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300";
      node.addEventListener("click", () => {
        const bb = new lib.LngLatBounds();
        for (const g of group) bb.extend([g.lng, g.lat]);
        m.fitBounds(bb, { padding: 70, maxZoom: 17, duration: 400 });
      });
      markers.current.push(new lib.Marker({ element: node }).setLngLat([lng, lat]).addTo(m));
    }
    for (const p of points) {
      const node = document.createElement("div");
      node.textContent = String(p.n);
      node.setAttribute("aria-label", `${t.stopLabel} ${p.n}: ${p.label}`);
      node.className = `flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white shadow ${p.current ? "bg-blue-600" : p.done ? "bg-slate-400" : "bg-slate-800"}`;
      markers.current.push(new lib.Marker({ element: node }).setLngLat([p.lng, p.lat]).addTo(m));
    }
  }; });

  // The recommended/ordered path through the stops, drawn live so "Suggest order" and manual reordering show immediately.
  useEffect(() => {
    const src = mapRef.current?.getSource("route") as import("maplibre-gl").GeoJSONSource | undefined;
    if (!lineReady || !src) return;
    const coordinates = [...points].sort((a, b) => a.n - b.n).map((p) => [p.lng, p.lat]);
    src.setData({ type: "FeatureCollection", features: coordinates.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }] : [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pointsKey` captures every input that matters (including the order `n`)
  }, [lineReady, pointsKey]);

  useEffect(() => {
    const m = mapRef.current, lib = libRef.current;
    if (!ready || !m || !lib) return;
    // Re-fit only when the SET of located places changes (not when the selection order changes).
    const fitKey = [...points.map((p) => p.id), ...background.map((b) => b.id)].sort().join("|");
    if (fitKey && fitKey !== fitted.current) {
      fitted.current = fitKey;
      const bounds = new lib.LngLatBounds();
      for (const p of [...points, ...background]) bounds.extend([p.lng, p.lat]);
      m.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });
    }
    renderRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the keys capture every input that matters
  }, [ready, pointsKey, bgKey]);

  if (failed) return null;
  return <div ref={el} role="region" aria-label={t.title} className={`w-full overflow-hidden rounded-lg border border-slate-200 ${tall ? "h-80 sm:h-[26rem]" : "h-64 sm:h-80"}`} />;
}

export function RouteMap({ points, background = [], onPick, onViewChange, tall, showSchematic = true, config, t }: { points: MapPoint[]; background?: BackgroundPoint[]; onPick?: (id: string) => void; onViewChange?: (ids: string[]) => void; tall?: boolean; showSchematic?: boolean; config: MapConfig | null; t: FieldCopy["map"] }) {
  const [failed, setFailed] = useState(false);
  return (
    <section className="space-y-2" aria-label={t.title}>
      {config ? <LiveMap points={points} background={background} onPick={onPick} onViewChange={onViewChange} onFailed={() => setFailed(true)} tall={tall} config={config} t={t} /> : <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{t.disabled}</p>}
      {background.length > 0 && <p className="text-xs text-slate-500">{t.located}: {background.length + points.length}. {config ? t.locatedHelp : ""}</p>}
      {(showSchematic || !config || failed) && <SchematicPlot points={points} background={background} t={t} />}
    </section>
  );
}
