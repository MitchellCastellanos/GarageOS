"use client";

import Link from "next/link";
import { useState } from "react";
import { decideDuplicateReview, type DuplicateDecision } from "@/actions/sales-duplicates";
import { PLATFORM } from "@/lib/routes";
import { Badge, btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";
import { leadCopy } from "@/lib/admin-locale/sales-lead-engine";

interface Side { name: string; address: string | null; city: string | null; province: string | null; postalCode: string | null; phone: string | null; website: string | null }
export interface ReviewRow {
  id: string; status: string; reasons: string[]; accessible: boolean; sourceKey: string; row: number | null; resultProspectId: string | null;
  incoming: Side; existing: (Side & { id: string; owner: string | null }) | null; createdAt: string; decidedAt: string | null;
}

function SideCard({ title, s, L, tone }: { title: string; s: Side; L: ReturnType<typeof leadCopy>; tone: string }) {
  const line = (k: string, v: string | null) => <div className="grid grid-cols-[6rem_1fr] gap-2 text-sm"><dt className="text-slate-500">{k}</dt><dd className="min-w-0 break-words text-slate-900">{v || "—"}</dd></div>;
  return (
    <div className={`min-w-0 rounded-lg border p-3 ${tone}`}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <dl className="space-y-1">
        {line(L.duplicates.name, s.name)}
        {line(L.duplicates.address, [s.address, s.city, s.province, s.postalCode].filter(Boolean).join(", "))}
        {line(L.duplicates.phone, s.phone)}{line(L.duplicates.website, s.website)}
      </dl>
    </div>
  );
}

export function DuplicateReviewList({ locale, rows }: { locale: "en" | "fr"; rows: ReviewRow[] }) {
  const L = leadCopy(locale);
  const { t, pending, error, run } = useCrmAction(locale);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const decide = (id: string, d: DuplicateDecision) => run(() => decideDuplicateReview(id, d, notes[id]));
  return (
    <>
      <FormMessage error={error} />
      <ul className="space-y-4">
        {rows.map((r) => (
          <li key={r.id} className={`${cardCls} space-y-3`}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={r.status === "PENDING" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}>{L.duplicates.status[r.status]}</Badge>
              {r.reasons.map((x) => <Badge key={x} tone="bg-blue-50 text-blue-800">{L.duplicates.reasons[x] ?? x}</Badge>)}
              <span className="text-xs text-slate-500">{r.sourceKey}{r.row ? ` · ${r.row}` : ""}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <SideCard title={L.duplicates.incoming} s={r.incoming} L={L} tone="border-blue-200 bg-blue-50/40" />
              {r.existing
                ? <SideCard title={`${L.duplicates.existing}${r.existing.owner ? ` · ${r.existing.owner}` : ""}`} s={r.existing} L={L} tone="border-slate-200" />
                : <p role="note" className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-600">{L.duplicates.restricted}</p>}
            </div>
            {r.status === "PENDING" && r.accessible && (
              <div className="space-y-3">
                <label className={labelCls}>{L.duplicates.noteLabel}<input className={inputCls} maxLength={500} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} /></label>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div><button className={`${btnPrimary} w-full`} disabled={pending} onClick={() => decide(r.id, "LINK")}>{L.duplicates.link}</button><p className="mt-1 text-xs text-slate-500">{L.duplicates.linkHelp}</p></div>
                  <div><button className={`${btnSecondary} w-full`} disabled={pending} onClick={() => decide(r.id, "DISTINCT")}>{L.duplicates.distinct}</button><p className="mt-1 text-xs text-slate-500">{L.duplicates.distinctHelp}</p></div>
                  <div><button className={`${btnSecondary} w-full`} disabled={pending} onClick={() => decide(r.id, "DISMISS")}>{L.duplicates.dismiss}</button><p className="mt-1 text-xs text-slate-500">{L.duplicates.dismissHelp}</p></div>
                </div>
              </div>
            )}
            {r.existing && <Link href={PLATFORM.salesProspect(r.existing.id)} className="inline-flex min-h-11 items-center text-sm text-blue-700">{L.duplicates.open}</Link>}
            {r.status !== "PENDING" && r.resultProspectId && <Link href={PLATFORM.salesProspect(r.resultProspectId)} className="inline-flex min-h-11 items-center text-sm text-blue-700">{L.duplicates.open}</Link>}
          </li>
        ))}
      </ul>
      <span className="sr-only">{t.common.loading}</span>
    </>
  );
}
