"use client";

// Donut chart del estado de las facturas
// Usa PieChart con innerRadius para el efecto donut.

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface StatusCount {
  status: string;
  label: string;
  count: number;
  color: string;
}

interface StatusPieProps {
  data: StatusCount[];
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-md text-sm">
      <p className="font-medium text-slate-700">{payload[0].name}</p>
      <p className="text-slate-900 font-semibold">{payload[0].value} facturas</p>
    </div>
  );
}

export function StatusPie({ data }: StatusPieProps) {
  const total = data.reduce((s, d) => s + d.count, 0);

  if (total === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
        Sin facturas todavía
      </div>
    );
  }

  const chartData = data.filter((d) => d.count > 0);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
            dataKey="count"
            nameKey="label"
            paddingAngle={2}
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => (
              <span style={{ fontSize: 11, color: "#64748b" }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Total en el centro */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center" style={{ marginTop: -28 }}>
          <p className="text-2xl font-bold text-slate-900">{total}</p>
          <p className="text-xs text-slate-400">total</p>
        </div>
      </div>
    </div>
  );
}
