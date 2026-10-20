"use client";

import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import { inputCls, labelCls } from "@/components/sales-crm/ui";
import { writeNotes } from "./shared";

/** Live call notes: a guarded localStorage draft per prospect (see shared.tsx), saved to the CRM only with the call outcome. */
export function LiveNotes({ c, prospectId, notes }: { c: CallingCopy; prospectId: string | null; notes: string }) {
  const n = c.ws.notes;
  const dirty = notes.trim().length > 0;
  return (
    <section aria-labelledby="notes-title" className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="notes-title" className="text-base font-semibold text-slate-900">{n.title}</h2>
        {dirty && <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"><span aria-hidden="true">● </span>{n.unsaved}</span>}
      </div>
      <label className={labelCls}><span className="sr-only">{n.label}</span>
        <textarea className={`${inputCls} min-h-48 py-2 leading-relaxed`} maxLength={2000} value={notes} disabled={!prospectId} placeholder={n.placeholder}
          onChange={(e) => { if (prospectId) writeNotes(prospectId, e.target.value); }} aria-describedby="notes-hint" />
      </label>
      <p id="notes-hint" className="text-xs text-slate-500">{prospectId ? n.local : c.ws.phone.noProspect}</p>
    </section>
  );
}
