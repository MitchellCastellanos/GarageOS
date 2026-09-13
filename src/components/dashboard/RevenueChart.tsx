"use client";

// BarChart de ingresos de los últimos 6 meses
// recharts es un Client Component — necesita el DOM para renderizar SVG.
// Los datos vienen del Server Component padre ya serializados (sin Decimal ni Date).

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { DASHBOARD_DICT } from "@/lib/admin-locale/dashboard";

interface MonthlyRevenue {
  month: string; // "Ene", "Feb", etc.
  revenue: number;
}

interface RevenueChartProps {
  data: MonthlyRevenue[];
}

function CustomTooltip({
  active,
  payload,
  label,
  intlLocale,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  intlLocale: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-md text-sm">
      <p className="font-medium text-slate-700">{label}</p>
      <p className="text-blue-600 font-semibold">
        ${payload[0].value.toLocaleString(intlLocale, { minimumFractionDigits: 2 })} CAD
      </p>
    </div>
  );
}

export function RevenueChart({ data }: RevenueChartProps) {
  const locale = useAdminLocale();
  const t = DASHBOARD_DICT[locale];
  const hasData = data.some((d) => d.revenue > 0);

  if (!hasData) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
        {t.revenueChart.empty}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip intlLocale={t.intlLocale} />} cursor={{ fill: "#f8fafc" }} />
        <Bar dataKey="revenue" fill="#1d4ed8" radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
