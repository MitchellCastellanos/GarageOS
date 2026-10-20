"use client";

import { useEffect, useRef } from "react";
import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import type { WorkspaceProfile } from "@/lib/voice/workspace-types";
import { btnPrimary, btnSecondary } from "@/components/sales-crm/ui";
import { fill } from "./shared";

/** Confirm-to-call outside the destination's calling hours (only placeable when the audited Super Admin switch allows it). Focus returns to the trigger. */
export function OutOfHoursDialog({ c, profile, allowed, onCancel, onConfirm }: { c: CallingCopy; profile: WorkspaceProfile; allowed: boolean; onCancel: () => void; onConfirm: () => void }) {
  const o = c.ws.phone.outOfHours;
  const back = useRef<Element | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    back.current = document.activeElement;
    first.current?.focus();
    return () => { const el = back.current; if (el instanceof HTMLElement && document.contains(el)) el.focus(); };
  }, []);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4" onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="ooh-title" aria-describedby="ooh-body" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="ooh-title" className="text-lg font-semibold text-slate-900">{o.title}</h2>
        <p id="ooh-body" className="text-sm text-slate-700">
          {fill(allowed ? o.body : o.disabled, { time: profile.window.localTime || "—", place: [profile.city, profile.province].filter(Boolean).join(", ") || profile.province || "—" })}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button ref={first} type="button" className={btnSecondary} onClick={onCancel}>{allowed ? o.cancel : o.close}</button>
          {allowed && <button type="button" className={`${btnPrimary} bg-amber-600 hover:bg-amber-700`} onClick={onConfirm}>{o.confirm}</button>}
        </div>
      </div>
    </div>
  );
}
