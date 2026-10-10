"use client";

import Link from "next/link";
import { useState } from "react";
import { approveSendingBasis, rejectSendingBasis } from "@/actions/sales-casl";
import { PLATFORM } from "@/lib/routes";
import { evidenceGaps } from "@/domain/sales-crm/casl-evidence";
import { Badge, btnDanger, btnPrimary, cardCls, formatDate, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { leadCopy } from "@/lib/admin-locale/sales-lead-engine";

export interface EvidenceRow {
  id: string; kind: string; evidence: string; evidenceType: string | null; sourceUrl: string | null; capturedAt: string | null; supportingFacts: string | null; roleRelevance: string | null;
  publishedConditionsConfirmed: boolean; recordedAt: string; recordedBy: string; contact: { name: string; email: string | null }; prospect: { id: string; name: string };
  canApprove: boolean; blocked: string | null; history: { action: string; at: string }[];
}

export function EvidenceReviewList({ locale, rows }: { locale: "en" | "fr"; rows: EvidenceRow[] }) {
  const L = leadCopy(locale), E = L.evidence, C = commsCopy(locale);
  const { t, pending, error, run } = useCrmAction(locale);
  const [text, setText] = useState<Record<string, string>>({});
  return (
    <>
      <FormMessage error={error} />
      <ul className="space-y-4">
        {rows.map((r) => {
          const gaps = evidenceGaps({ kind: r.kind, evidenceType: r.evidenceType, sourceUrl: r.sourceUrl, capturedAt: r.capturedAt ? new Date(r.capturedAt) : null, supportingFacts: r.supportingFacts, roleRelevance: r.roleRelevance, publishedConditionsConfirmed: r.publishedConditionsConfirmed });
          const row = (k: string, v: React.ReactNode) => <div className="grid grid-cols-1 gap-0.5 text-sm sm:grid-cols-[11rem_1fr] sm:gap-2"><dt className="text-slate-500">{k}</dt><dd className="min-w-0 break-words text-slate-900">{v || "—"}</dd></div>;
          return (
            <li key={r.id} className={`${cardCls} space-y-3`}>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={PLATFORM.salesProspect(r.prospect.id)} className="break-words font-semibold text-blue-700">{r.prospect.name}</Link>
                <Badge tone="bg-amber-100 text-amber-800">{E.status.PENDING_REVIEW}</Badge><Badge>{C.basis.kinds[r.kind as keyof typeof C.basis.kinds] ?? r.kind}</Badge>
              </div>
              <dl className="space-y-1.5">
                {row(E.contact, `${r.contact.name}${r.contact.email ? ` · ${r.contact.email}` : ""}`)}
                {row(E.recordedBy, `${r.recordedBy} · ${formatDate(r.recordedAt, locale)}`)}
                {row(E.type, r.evidenceType ? E.types[r.evidenceType] : null)}
                {row(E.sourceUrl, r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-blue-700 underline">{r.sourceUrl}</a> : null)}
                {row(E.capturedAt, r.capturedAt ? formatDate(r.capturedAt, locale) : null)}
                {row(E.facts, r.supportingFacts)}{row(E.role, r.roleRelevance)}
                {r.kind === "IMPLIED_PUBLISHED_ADDRESS" && row(E.publishedOk, r.publishedConditionsConfirmed ? t.common.yes : t.common.no)}
              </dl>
              {gaps.length > 0 && <p role="note" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{gaps.map((g) => E.gaps[g]).join(" · ")}</p>}
              {r.history.length > 0 && <details><summary className="min-h-11 cursor-pointer py-2 text-sm text-slate-700">{E.history}</summary><ul className="space-y-1 text-xs text-slate-600">{r.history.map((h, i) => <li key={i}>{formatDate(h.at, locale, true)} — {h.action}</li>)}</ul></details>}
              {r.blocked && r.blocked !== "NOT_PENDING" && <p role="note" className="text-sm text-slate-600">{L.errors[`CASL_${r.blocked}`] ?? ""}</p>}
              {r.canApprove && (
                <div className="space-y-2">
                  <label className={labelCls}><span className="sr-only">{E.notePlaceholder}</span><input className={inputCls} maxLength={500} placeholder={`${E.notePlaceholder} / ${E.reasonPlaceholder}`} value={text[r.id] ?? ""} onChange={(e) => setText({ ...text, [r.id]: e.target.value })} /></label>
                  <div className="flex flex-wrap gap-2">
                    <button className={btnPrimary} disabled={pending || gaps.length > 0} onClick={() => run(() => approveSendingBasis(r.id, text[r.id]))}>{E.approve}</button>
                    <button className={btnDanger} disabled={pending || (text[r.id] ?? "").trim().length < 5} onClick={() => run(() => rejectSendingBasis(r.id, text[r.id] ?? ""))}>{E.reject}</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
