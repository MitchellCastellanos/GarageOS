const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activos",
  TRIALING: "En prueba",
  PAST_DUE: "Pago atrasado",
  CANCELED: "Cancelados",
  UNPAID: "Sin pagar",
  INCOMPLETE: "Incompletos",
};

export interface PlatformGrowth {
  totalShops: number;
  newShops30d: number;
  newShops90d: number;
  mrr: number;
  byStatus: Record<string, number>;
  cancellations30d: number;
  cancellationsAll: number;
  churnRate30d: number;
  cohorts: { month: string; count: number }[];
}

function fmtMoney(n: number) {
  return n.toLocaleString("es-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
}

function fmtMonth(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-CA", { month: "short", year: "2-digit" });
}

export function PlatformGrowthSummary({ growth }: { growth: PlatformGrowth }) {
  const maxCohort = Math.max(1, ...growth.cohorts.map((c) => c.count));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Talleres totales" value={growth.totalShops.toString()} />
        <Stat label="Nuevos (30d)" value={growth.newShops30d.toString()} />
        <Stat label="MRR" value={fmtMoney(growth.mrr)} />
        <Stat label="Cancelación (30d)" value={`${growth.churnRate30d.toFixed(1)}%`} tone={growth.churnRate30d > 5 ? "warn" : "default"} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Suscripciones por estado</h3>
          <div className="space-y-1.5">
            {Object.entries(growth.byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{STATUS_LABELS[status] ?? status}</span>
                <span className="font-medium text-slate-900">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Altas por mes (últimos 6 meses)</h3>
          <div className="flex items-end gap-2 h-24">
            {growth.cohorts.map((c) => (
              <div key={c.month} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-blue-500"
                  style={{ height: `${Math.max(4, (c.count / maxCohort) * 80)}px`, backgroundColor: "#2a78d6" }}
                  title={`${c.count} talleres`}
                />
                <span className="text-[10px] text-slate-400">{fmtMonth(c.month)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return (
    <div className={`border rounded-xl p-4 ${tone === "warn" ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
      <p className={`text-2xl font-bold ${tone === "warn" ? "text-red-700" : "text-slate-900"}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}
