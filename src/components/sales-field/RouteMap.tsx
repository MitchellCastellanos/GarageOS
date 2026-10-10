"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldCopy } from "@/lib/admin-locale/sales-field";

export interface MapPoint { id: string; n: number; label: string; lat: number; lng: number; done?: boolean; current?: boolean }
export interface MapConfig { styleUrl: string; attribution: string }

const W = 320, H = 220, PAD = 22;

/** Always-available plot of the stops' relative positions. It is labelled as schematic: it is not a map and has no basemap. */
function SchematicPlot({ points, t }: { points: MapPoint[]; t: FieldCopy["map"] }) {
  if (!points.length) return null;
  const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2, kx = Math.cos((midLat * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * kx, 1e-6), spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
  const ox = (W - spanX * scale) / 2, oy = (H - spanY * scale) / 2;
  const pos = (p: MapPoint) => ({ x: ox + (p.lng - minLng) * kx * scale, y: oy + (maxLat - p.lat) * scale });
  const pts = points.map((p) => ({ p, ...pos(p) }));
  return (
    <figure className="min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.plotLabel} className="h-auto w-full rounded-lg border border-slate-200 bg-slate-50">
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

/** Lazy MapLibre map, mounted only when an approved tile style + attribution are configured (server-side env). */
function LiveMap({ points, config, t }: { points: MapPoint[]; config: MapConfig; t: FieldCopy["map"] }) {
  const el = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const key = points.map((p) => `${p.id}:${p.lat}:${p.lng}:${p.n}:${p.current ? 1 : 0}`).join("|");
  useEffect(() => {
    let map: import("maplibre-gl").Map | null = null, cancelled = false;
    (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        await import("maplibre-gl/dist/maplibre-gl.css");
        if (cancelled || !el.current) return;
        const m = new maplibre.Map({ container: el.current, style: config.styleUrl, attributionControl: { customAttribution: config.attribution, compact: false }, cooperativeGestures: true });
        map = m;
        m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        const bounds = new maplibre.LngLatBounds();
        for (const p of points) {
          const node = document.createElement("div");
          node.textContent = String(p.n);
          node.setAttribute("aria-label", `${t.stopLabel} ${p.n}: ${p.label}`);
          node.className = `flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white shadow ${p.current ? "bg-blue-600" : p.done ? "bg-slate-400" : "bg-slate-800"}`;
          new maplibre.Marker({ element: node }).setLngLat([p.lng, p.lat]).addTo(m);
          bounds.extend([p.lng, p.lat]);
        }
        if (points.length) m.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });
        m.on("error", () => { if (!cancelled) setFailed(true); });
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; map?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures every input that matters
  }, [key, config.styleUrl, config.attribution]);
  if (failed) return null;
  return <div ref={el} role="region" aria-label={t.title} className="h-64 w-full overflow-hidden rounded-lg border border-slate-200 sm:h-80" />;
}

export function RouteMap({ points, config, t }: { points: MapPoint[]; config: MapConfig | null; t: FieldCopy["map"] }) {
  return (
    <section className="space-y-2" aria-label={t.title}>
      {config ? <LiveMap points={points} config={config} t={t} /> : <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{t.disabled}</p>}
      <SchematicPlot points={points} t={t} />
    </section>
  );
}
