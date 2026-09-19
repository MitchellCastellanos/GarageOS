"use client";

import Link from "next/link";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { PLATFORM } from "@/lib/routes";
import type { HourlyPoint, DailyPoint, RangeBreakdown } from "@/lib/platform/analytics";

// Paleta validada (dataviz skill) — series-1 azul (vistas), series-2 naranja (únicos).
const COLOR_VIEWS = "#2a78d6";
const COLOR_UNIQUES = "#eb6834";

function fmtDay(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-CA", { month: "short", day: "numeric" });
}

function fmtHour(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-CA", { hour: "numeric" });
}

export function AnalyticsDashboard({
  last24h,
  daily,
  breakdown,
  days,
}: {
  last24h: HourlyPoint[];
  daily: DailyPoint[];
  breakdown: RangeBreakdown;
  days: number;
}) {
  const views24h = last24h.reduce((sum, p) => sum + p.views, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">Visitas de primera parte, sin cookies — sitio de marketing y páginas de reserva.</p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={`${PLATFORM.analytics}?days=${d}`}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                days === d ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Vistas (últimas 24h)" value={views24h} />
        <Stat label={`Vistas (${days}d)`} value={breakdown.totals.views} />
        <Stat label={`Visitantes únicos (${days}d)`} value={breakdown.totals.uniques} />
        <Stat label="Talleres con tráfico" value={breakdown.topShops.length} />
      </div>

      <section>
        <h2 className="font-semibold text-slate-900 mb-3">Últimas 24 horas</h2>
        <div className="bg-white border border-slate-200 rounded-xl p-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last24h} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="hour" tickFormatter={fmtHour} interval={2} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                labelFormatter={(v) => fmtHour(v as string)}
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
              />
              <Bar dataKey="views" name="Vistas" fill={COLOR_VIEWS} radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-slate-900 mb-3">Tendencia ({days} días)</h2>
        <div className="bg-white border border-slate-200 rounded-xl p-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR_VIEWS} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={COLOR_VIEWS} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="uniquesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR_UNIQUES} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={COLOR_UNIQUES} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip labelFormatter={(v) => fmtDay(v as string)} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Area type="monotone" dataKey="views" name="Vistas" stroke={COLOR_VIEWS} fill="url(#viewsFill)" strokeWidth={2} />
              <Area type="monotone" dataKey="uniques" name="Únicos" stroke={COLOR_UNIQUES} fill="url(#uniquesFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLOR_VIEWS }} /> Vistas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLOR_UNIQUES }} /> Visitantes únicos
          </span>
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <BreakdownList title="Páginas más visitadas" rows={breakdown.topPages.map((p) => ({ label: p.path, value: p.views }))} />
        <BreakdownList title="Origen del tráfico" rows={breakdown.topReferrers.map((r) => ({ label: r.referrer, value: r.views }))} />
        <BreakdownList title="Dispositivo" rows={breakdown.devices.map((d) => ({ label: d.device, value: d.views }))} />
        <BreakdownList title="Navegador" rows={breakdown.browsers.map((b) => ({ label: b.browser, value: b.views }))} />
        <BreakdownList title="País" rows={breakdown.countries.map((c) => ({ label: c.country, value: c.views }))} />
        <BreakdownList title="Talleres con más tráfico (landing pública)" rows={breakdown.topShops.map((s) => ({ label: s.shopSlug, value: s.views }))} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-2xl font-bold text-slate-900">{value.toLocaleString("es-CA")}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}

function BreakdownList({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Sin datos en este rango.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2 sm:gap-3 text-sm">
              <span className="w-20 sm:w-32 shrink-0 truncate text-slate-600" title={r.label}>
                {r.label}
              </span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, backgroundColor: "#2a78d6" }} />
              </div>
              <span className="w-8 sm:w-10 text-right text-slate-500 tabular-nums shrink-0">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
