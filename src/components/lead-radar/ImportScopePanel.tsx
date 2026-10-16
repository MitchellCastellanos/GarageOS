"use client";

import { useState } from "react";
import { setLeadImportProvinces } from "@/actions/lead-radar-automation";
import { PROVINCE_CODES, PROVINCE_NAMES } from "@/domain/lead-radar/geo";
import { btnPrimary, cardCls } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";
import { fill } from "@/lib/admin-locale/lead-radar";
import { nationalCopy } from "@/lib/admin-locale/lead-radar-national";

/** Province scope of the AUTOMATIC import (empty = all). Owner-only; it never moves or removes anything already in the CRM. */
export function ImportScopePanel({ locale, initial }: { locale: "en" | "fr"; initial: string[] }) {
  const { error, notice, pending, run } = useRadarAction(locale);
  const k = nationalCopy(locale).dash.scope;
  const [sel, setSel] = useState<string[]>(initial);
  const toggle = (p: string) => setSel((l) => (l.includes(p) ? l.filter((x) => x !== p) : [...l, p]));
  return (
    <section className={`${cardCls} space-y-3`} aria-labelledby="nat-scope">
      <h2 id="nat-scope" className="font-semibold text-slate-900">{k.title}</h2>
      <p className="text-xs text-slate-600">{k.help}</p>
      <p className="text-sm font-medium text-slate-800">{sel.length ? fill(k.limited, { list: sel.join(", ") }) : k.all}</p>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-6">
        {PROVINCE_CODES.map((p) => <label key={p} className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-5" checked={sel.includes(p)} onChange={() => toggle(p)} />{PROVINCE_NAMES[p][locale]} ({p})</label>)}
      </div>
      <FormMessage error={error} notice={notice} />
      <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => setLeadImportProvinces(sel), undefined, k.saved)}>{k.save}</button>
    </section>
  );
}
