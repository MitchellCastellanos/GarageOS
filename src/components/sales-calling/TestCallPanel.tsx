"use client";

import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import { btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";

/** Super Admin test call (approved test numbers only), in a small native collapsible section. */
export function TestCallPanel({ c, gateOpen, numbers, value, onChange, locked, onCall }: {
  c: CallingCopy; gateOpen: boolean; numbers: { value: string; masked: string }[]; value: string; onChange: (v: string) => void; locked: boolean; onCall: () => void;
}) {
  return (
    <details className="group min-w-0 rounded-xl border border-slate-200 bg-white">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300">
        <span>{c.test.title}</span>
        <span aria-hidden="true" className="text-slate-400 motion-safe:transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-2 px-3 pb-3">
        <p className="text-xs text-slate-600">{c.test.hint}</p>
        {!gateOpen ? <p className="text-sm text-amber-800">{c.test.needsGates}</p> : numbers.length === 0 ? <p className="text-sm text-slate-600">{c.test.none}</p> : (
          <div className="space-y-2">
            <label className={labelCls}>{c.test.number}
              <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
                {numbers.map((n) => <option key={n.value} value={n.value}>{n.masked}</option>)}
              </select>
            </label>
            <button type="button" className={`${btnSecondary} w-full`} disabled={locked || !value} onClick={onCall}>{c.test.call}</button>
          </div>
        )}
      </div>
    </details>
  );
}
