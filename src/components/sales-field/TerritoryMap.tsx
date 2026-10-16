"use client";

import { useEffect, useRef, useState } from "react";
import { STATUS_COLOR, type Bbox, type Cluster, type MapPointDto, type MapStatus } from "@/domain/sales-crm/field-map";
import type { MapConfig } from "@/components/sales-field/RouteMap";

export interface RouteStopMarker { id: string; n: number; label: string; lat: number; lng: number; status?: MapStatus }
export interface MapViewport { bbox: Bbox; zoom: number }
export type FlyTo = { key: string; bbox: Bbox } | { key: string; center: { lat: number; lng: number }; zoom: number };
export interface TerritoryMapCopy { title: string; select: string; stop: string; cluster: string; you: string; unavailable: string }

const baseStyle = (c: MapConfig): string | import("maplibre-gl").StyleSpecification =>
  c.rasterTiles?.length ? { version: 8, sources: { base: { type: "raster", tiles: c.rasterTiles, tileSize: c.tileSize ?? 256, maxzoom: 22 } }, layers: [{ id: "base", type: "raster", source: "base" }] } : (c.styleUrl ?? "");

/**
 * Territory map. The SERVER decides what is drawn (individual markers or counted clusters for the visible area); this component only
 * draws it, reports the viewport (debounced) and the tapped marker. Markers are 40px tap targets around a coloured dot, so a
 * thumb can pick one in a dense area; the route stops are numbered and always drawn, even when they scroll out of the loaded area.
 */
export function TerritoryMap({ config, points, clusters, stops, selectedId, you, flyTo, onViewport, onSelect, t, className }: {
  config: MapConfig; points: MapPointDto[]; clusters: Cluster[]; stops: RouteStopMarker[]; selectedId: string | null; you: { lat: number; lng: number } | null;
  flyTo: FlyTo | null; onViewport: (v: MapViewport) => void; onSelect: (id: string) => void; t: TerritoryMapCopy; className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef<import("maplibre-gl").Marker[]>([]);
  const cb = useRef({ onViewport, onSelect });
  const flown = useRef("");
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => { cb.current = { onViewport, onSelect }; }, [onViewport, onSelect]);
  const cfgKey = `${config.styleUrl ?? ""}|${(config.rasterTiles ?? []).join(",")}|${config.attribution}`;

  useEffect(() => {
    let cancelled = false, timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        await import("maplibre-gl/dist/maplibre-gl.css");
        if (cancelled || !el.current) return;
        maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
        const m = new maplibre.Map({ container: el.current, style: baseStyle(config), attributionControl: { customAttribution: config.attribution, compact: true }, cooperativeGestures: false, center: [-73.57, 45.5], zoom: 10 });
        libRef.current = maplibre; mapRef.current = m;
        m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        m.on("error", () => { if (!cancelled) setFailed(true); });
        const report = () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            const b = m.getBounds();
            cb.current.onViewport({ bbox: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, zoom: m.getZoom() });
          }, 250);
        };
        m.on("moveend", report);
        m.on("load", () => { if (!cancelled) { setReady(true); report(); } });
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; clearTimeout(timer); markers.current.forEach((x) => x.remove()); markers.current = []; mapRef.current?.remove(); mapRef.current = null; setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `cfgKey` captures every config input that matters
  }, [cfgKey]);

  useEffect(() => {
    const m = mapRef.current, lib = libRef.current;
    if (!ready || !m || !lib || !flyTo || flown.current === flyTo.key) return;
    flown.current = flyTo.key;
    if ("bbox" in flyTo) m.fitBounds([[flyTo.bbox.west, flyTo.bbox.south], [flyTo.bbox.east, flyTo.bbox.north]], { padding: 40, maxZoom: 16, duration: 500 });
    else m.flyTo({ center: [flyTo.center.lng, flyTo.center.lat], zoom: flyTo.zoom, duration: 500 });
  }, [ready, flyTo]);

  useEffect(() => {
    const m = mapRef.current, lib = libRef.current;
    if (!ready || !m || !lib) return;
    markers.current.forEach((x) => x.remove()); markers.current = [];
    const add = (node: HTMLElement, lng: number, lat: number) => markers.current.push(new lib.Marker({ element: node }).setLngLat([lng, lat]).addTo(m));
    const stopIds = new Set(stops.map((s) => s.id));

    for (const c of clusters) {
      const size = c.count < 10 ? 40 : c.count < 100 ? 48 : 58;
      const node = document.createElement("button");
      node.type = "button";
      node.textContent = String(c.count);
      node.setAttribute("aria-label", `${c.count} ${t.cluster}`);
      node.title = `${c.count} ${t.cluster}`;
      node.style.width = node.style.height = `${size}px`;
      node.className = "flex items-center justify-center rounded-full border-2 border-white bg-blue-700/90 text-sm font-semibold text-white shadow-md focus:outline-none focus:ring-2 focus:ring-blue-300";
      node.addEventListener("click", () => {
        const b = c.bbox;
        if (b.east - b.west < 1e-5 && b.north - b.south < 1e-5) m.flyTo({ center: [c.lng, c.lat], zoom: Math.min(18, m.getZoom() + 3), duration: 350 });
        else m.fitBounds([[b.west, b.south], [b.east, b.north]], { padding: 60, maxZoom: 17, duration: 400 });
      });
      add(node, c.lng, c.lat);
    }
    for (const p of points) {
      if (stopIds.has(p.id)) continue;
      const node = document.createElement("button");
      node.type = "button";
      node.setAttribute("aria-label", `${t.select}: ${p.name}`);
      node.title = p.name;
      node.className = "flex h-10 w-10 items-center justify-center focus:outline-none";
      const dot = document.createElement("span");
      const sel = p.id === selectedId;
      dot.className = `block rounded-full border-2 border-white shadow ${sel ? "h-7 w-7 ring-4 ring-blue-400" : "h-5 w-5"}`;
      dot.style.backgroundColor = STATUS_COLOR[p.status];
      node.appendChild(dot);
      node.addEventListener("click", () => cb.current.onSelect(p.id));
      add(node, p.lng, p.lat);
    }
    for (const s of stops) {
      const node = document.createElement("button");
      node.type = "button";
      node.textContent = String(s.n);
      node.setAttribute("aria-label", `${t.stop} ${s.n}: ${s.label}`);
      node.title = `${t.stop} ${s.n}: ${s.label}`;
      node.className = `flex h-9 w-9 items-center justify-center rounded-full border-[3px] bg-slate-900 text-sm font-bold text-white shadow-md focus:outline-none ${s.id === selectedId ? "ring-4 ring-blue-400" : ""}`;
      node.style.borderColor = s.status ? STATUS_COLOR[s.status] : "#ffffff";
      node.addEventListener("click", () => cb.current.onSelect(s.id));
      add(node, s.lng, s.lat);
    }
    if (you) {
      const node = document.createElement("div");
      node.setAttribute("aria-label", t.you);
      node.title = t.you;
      node.className = "h-4 w-4 rounded-full border-2 border-white bg-sky-500 shadow ring-4 ring-sky-300/60";
      add(node, you.lng, you.lat);
    }
  }, [ready, points, clusters, stops, selectedId, you, t]);

  if (failed) return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.unavailable}</p>;
  return <div ref={el} role="region" aria-label={t.title} className={`w-full overflow-hidden rounded-lg border border-slate-200 ${className ?? "h-[55vh] min-h-72 lg:h-[34rem]"}`} />;
}
