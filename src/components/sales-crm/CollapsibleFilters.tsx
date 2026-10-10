"use client";

import { useState, type ReactNode } from "react";

/** Mobile: a compact "Filters" toggle (collapsed unless filters are active). md and up: always open. */
export function CollapsibleFilters({ label, activeCount, children }: { label: string; activeCount: number; children: ReactNode }) {
  const [open, setOpen] = useState(activeCount > 0);
  return (
    <div className="space-y-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex min-h-11 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 md:hidden">
        <span>{label}{activeCount > 0 ? ` (${activeCount})` : ""}</span><span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      <div className={`${open ? "block" : "hidden"} md:block`}>{children}</div>
    </div>
  );
}
