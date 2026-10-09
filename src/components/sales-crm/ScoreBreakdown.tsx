import { crmCopy } from "@/lib/admin-locale/sales-crm";

interface Factor { key: string; weight: number; value: number | null }

/** Explains a stored score: every factor with its weight and value, missing data shown as excluded (never as zero). */
export function ScoreBreakdown({ locale, breakdown }: { locale: "en" | "fr"; breakdown: unknown }) {
  const t = crmCopy(locale);
  const b = (breakdown ?? {}) as { confidence?: number; factors?: Factor[] };
  const factors = Array.isArray(b.factors) ? b.factors : [];
  if (factors.length === 0) return null;
  return (
    <details className="mt-2 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 text-slate-600">{t.scoring.explain}{typeof b.confidence === "number" && <> · {t.scoring.confidence}: {Math.round(b.confidence * 100)}%</>}</summary>
      <table className="w-full text-left text-xs">
        <thead className="text-slate-500"><tr><th scope="col" className="py-1 pr-2 font-medium">{t.scoring.factor}</th><th scope="col" className="py-1 pr-2 font-medium">{t.scoring.weight}</th><th scope="col" className="py-1 font-medium">{t.scoring.contribution}</th></tr></thead>
        <tbody>
          {factors.map((f) => (
            <tr key={f.key} className="border-t border-slate-100">
              <td className="py-1 pr-2 text-slate-800">{t.scoring.factors[f.key] ?? f.key}</td>
              <td className="py-1 pr-2 tabular-nums">{f.weight}</td>
              <td className="py-1 tabular-nums">{f.value === null ? <span className="text-slate-400">{t.scoring.unknown}</span> : `${Math.round(f.value * 100)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
