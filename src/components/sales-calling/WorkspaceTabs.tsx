"use client";

import type { KeyboardEvent, ReactNode } from "react";

export interface TabDef { id: string; label: string; badge?: ReactNode }

/** WAI-ARIA tablist with roving tabindex (Arrow keys, Home, End). Panels are rendered by the caller and stay mounted (hidden with CSS). */
export function WorkspaceTabs({ label, idPrefix, tabs, active, onChange, className = "" }: { label: string; idPrefix: string; tabs: TabDef[]; active: string; onChange: (id: string) => void; className?: string }) {
  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = tabs.length - 1;
    const to = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to].id);
    const el = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']")[to];
    el?.focus();
  }
  return (
    <div role="tablist" aria-label={label} className={`flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 ${className}`}>
      {tabs.map((t, i) => {
        const on = t.id === active;
        return (
          <button key={t.id} type="button" role="tab" id={`${idPrefix}-tab-${t.id}`} aria-selected={on} aria-controls={`${idPrefix}-panel-${t.id}`} tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}
            className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 ${on ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
            {t.label}{t.badge}
          </button>
        );
      })}
    </div>
  );
}

/** A tab panel that is always mounted; inactive panels are hidden with CSS so their drafts and form state are never lost. */
export function TabPanel({ idPrefix, id, active, children, className = "" }: { idPrefix: string; id: string; active: boolean; children?: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} tabIndex={0} hidden={!active} className={`min-w-0 focus:outline-none ${className}`}>
      {children}
    </div>
  );
}
