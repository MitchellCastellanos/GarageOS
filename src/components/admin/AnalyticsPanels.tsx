import { PLATFORM } from "@/lib/routes";
import type { PanelsData } from "@/lib/platform/analytics-panels";
import {
  CHANNEL_NAMES,
  CTA_NAMES,
  LOCALE_NAMES,
  MIN_CELL_SIZE,
  OTHER_KEY,
  OTHER_LABEL,
  PAGE_TYPE_NAMES,
  displayKey,
  ratePer100,
  type AnalyticsRange,
  type CountRow,
  type FunnelRow,
} from "@/lib/platform/analytics-panels-core";

const RANGE_ERRORS: Record<NonNullable<AnalyticsRange["error"]>, string> = {
  invalid: "Fechas no válidas (use AAAA-MM-DD). Se muestran los últimos 30 días.",
  order: "La fecha inicial debe ser anterior o igual a la final. Se muestran los últimos 30 días.",
  future: "La fecha final no puede estar en el futuro. Se muestran los últimos 30 días.",
  too_long: "El rango máximo es de 400 días. Se muestran los últimos 30 días.",
};

/**
 * Analytics v2 panels (server component, aggregates only). Super Admin access is enforced by the page (requireSuperAdmin) before this renders.
 * Dates are UTC calendar days. Buckets under the minimum cell size are folded into "Otros (<5)"; rows from before classification are labelled, never guessed.
 */
export function AnalyticsPanels({ range, data }: { range: AnalyticsRange; data: PanelsData }) {
  const todayDay = new Date().toISOString().slice(0, 10);
  return (
    <section className="space-y-6 mt-10" aria-labelledby="v2-panels">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="v2-panels" className="text-xl font-bold text-slate-900">Adquisición y contenido</h2>
          <p className="text-sm text-slate-500 mt-1">
            Del {range.fromDay} al {range.toDay} (UTC, {range.days} {range.days === 1 ? "día" : "días"}). Solo agregados; sin datos por visitante.
          </p>
        </div>
        <form method="get" action={PLATFORM.analytics} className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col text-xs text-slate-500">
            Desde
            <input type="date" name="from" defaultValue={range.fromDay} max={todayDay} className="mt-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            Hasta
            <input type="date" name="to" defaultValue={range.toDay} max={todayDay} className="mt-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
          </label>
          <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">Aplicar rango</button>
        </form>
      </div>
      {range.error && <p role="alert" className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">{RANGE_ERRORS[range.error]}</p>}

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Visitas (páginas vistas)" value={data.totals.views} />
        <Stat label="Visitantes únicos diarios (hashes seudónimos)" value={data.totals.uniques} />
      </div>
      <p className="text-xs text-slate-500 -mt-3">
        «Únicos» cuenta hashes seudónimos DIARIOS distintos, no personas: el identificador cambia cada día, así que quien vuelve en dos días cuenta dos veces.
        Los visitantes que activan «no rastrear» (DNT/GPC) no se registran.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <Breakdown title="Canales de adquisición (visitas)" rows={data.channels} names={CHANNEL_NAMES} />
        <Breakdown title="Tipo de página (visitas)" rows={data.pageTypes} names={PAGE_TYPE_NAMES} />
        <Breakdown title="Idioma (visitas)" rows={data.locales} names={LOCALE_NAMES} />
        <CtaCard data={data} />
      </div>

      {data.hasAnyEvents && <Funnel rows={data.funnel} />}

      <p className="text-xs text-slate-500">
        Las categorías con menos de {MIN_CELL_SIZE} visitas o eventos se agrupan en «{OTHER_LABEL}». Las filas anteriores a la clasificación (canal y tipo de página vacíos)
        se muestran como «Sin clasificar» y no se les asigna ninguna atribución. La conversión a registro no se muestra todavía: requiere la atribución de registros (pendiente).
      </p>
    </section>
  );
}

function CtaCard({ data }: { data: PanelsData }) {
  if (!data.hasAnyEvents) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Clics en CTA (eventos)</h3>
        <p className="text-sm text-slate-500">La recolección de clics en CTA está desactivada (sin eventos registrados). Se activa con la variable ANALYTICS_CTA_ENABLED tras la revisión legal del aviso de privacidad.</p>
      </div>
    );
  }
  return <Breakdown title="Clics en CTA (eventos, no personas)" rows={data.ctas} names={CTA_NAMES} empty="Sin eventos en este rango." />;
}

function Funnel({ rows }: { rows: FunnelRow[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-900">Embudo simple: vistas de la página → clics en el CTA</h3>
      <p className="text-xs text-slate-500 mt-1 mb-3">
        Solo páginas con al menos un clic registrado en ese CTA (no hay señal de «CTA mostrado»), por lo que la tasa es descriptiva, no una tasa de conversión.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Sin eventos en este rango.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1 pr-3 font-medium">CTA</th>
                <th className="py-1 pr-3 font-medium">Página</th>
                <th className="py-1 pr-3 font-medium text-right">Vistas</th>
                <th className="py-1 pr-3 font-medium text-right">Clics</th>
                <th className="py-1 font-medium text-right">Clics por 100 vistas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.ctaId}|${r.path}`} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3 text-slate-700">{CTA_NAMES[r.ctaId] ?? r.ctaId}</td>
                  <td className="py-1.5 pr-3 text-slate-600 max-w-[16rem] truncate" title={r.path === OTHER_KEY ? OTHER_LABEL : r.path}>{r.path === OTHER_KEY ? OTHER_LABEL : r.path}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">{r.views.toLocaleString("es-CA")}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-900">{r.clicks.toLocaleString("es-CA")}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">{ratePer100(r.clicks, r.views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

function Breakdown({ title, rows, names, empty = "Sin datos en este rango." }: { title: string; rows: CountRow[]; names: Record<string, string>; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">{empty}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const label = displayKey(r.key, names);
            return (
              <div key={r.key || "__none__"} className="flex items-center gap-2 sm:gap-3 text-sm">
                <span className="w-28 sm:w-44 shrink-0 truncate text-slate-600" title={label}>{label}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, backgroundColor: "#2a78d6" }} />
                </div>
                <span className="w-10 text-right text-slate-500 tabular-nums shrink-0">{r.count.toLocaleString("es-CA")}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
