import Link from "next/link";
import { Lock } from "lucide-react";
import { ADMIN } from "@/lib/routes";
import { PLAN_LABELS, type Plan } from "@/config/entitlements";

interface UpgradeCTAProps {
  requiredPlan: Plan;
  title: string;
  description: string;
  ctaLabel?: string;
  /** Compacto — para usar dentro de una tarjeta existente en vez de a pantalla completa. */
  compact?: boolean;
}

export function UpgradeCTA({ requiredPlan, title, description, ctaLabel, compact }: UpgradeCTAProps) {
  const href = `${ADMIN.settings}?tab=billing&plan=${requiredPlan.toLowerCase()}`;

  return (
    <div
      className={
        compact
          ? "rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4"
          : "bg-white rounded-xl border border-slate-200 p-10 text-center"
      }
    >
      <div className={compact ? "flex items-start gap-3" : "flex flex-col items-center"}>
        <div
          className={
            compact
              ? "shrink-0 w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center"
              : "w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-3"
          }
        >
          <Lock className={compact ? "w-4 h-4" : "w-5 h-5"} />
        </div>
        <div className={compact ? "" : "max-w-sm"}>
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="text-sm text-slate-500 mt-1">{description}</p>
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 mt-3 bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {ctaLabel ?? `Actualizar a ${PLAN_LABELS[requiredPlan]}`}
          </Link>
        </div>
      </div>
    </div>
  );
}
