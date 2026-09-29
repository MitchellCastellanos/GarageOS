"use client";

import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { RAIL_VARIANTS, type RailVariant } from "./types";

/**
 * Control temporal solo para este branch de preview — deja comparar los 3
 * layouts nuevos contra el actual en el mismo deploy, sin tener que elegir
 * uno antes de decidir. Se quita al implementar el layout definitivo.
 */
export function RailVariantSwitcher({
  value,
  onChange,
}: {
  value: RailVariant;
  onChange: (variant: RailVariant) => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="no-print fixed bottom-3 left-3 z-[60] flex items-center gap-1 rounded-full bg-slate-900/95 backdrop-blur px-1.5 py-1.5 shadow-xl border border-slate-700">
      {RAIL_VARIANTS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors",
            value === option.value
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
