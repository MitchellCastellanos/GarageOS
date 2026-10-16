"use client";

import Link from "next/link";
import { useState } from "react";
import { importApprovedDiscoveryCandidates, reviewDiscoveryCandidates } from "@/actions/lead-radar";
import { fill } from "@/lib/admin-locale/lead-radar";
import { fitReasonLabel, nationalCopy } from "@/lib/admin-locale/lead-radar-national";
import { PLATFORM } from "@/lib/routes";
import { Badge, btnPrimary, btnSecondary, cardCls } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";

export interface CandidateRow {
  id: string; name: string; address: string | null; city: string | null; province: string | null; postalCode: string | null; phone: string | null; website: string | null; email: string | null;
  territoryKey: string | null; taxonomyPrimary: string | null; tier: string; classReasons: string[]; chainSignal: string; sourceConfidence: number | null; completeness: number; qualityFlags: string[];
  licenses: string[]; datasets: string[]; licenseOk: boolean; lastSeenRelease: string; reviewState: string; reviewNote: string | null; matchState: string; matchReasons: string[]; importState: string;
  importErrorCode: string | null; changedSinceImport: boolean; qualificationLane: string | null; qualificationReasons: string[]; approvedByPolicyVersion: number | null;
  repairFit: string | null; repairFitReasons: string[]; duplicateOfCandidateId: string | null; segment: string;
  eligibility: { eligible: boolean; reasons: string[] };
  match: { id: string; visible: boolean; name: string | null; owned: boolean } | null;
  imported: { id: string; visible: boolean } | null;
}

const TIER_TONE: Record<string, string> = { PRIMARY: "bg-emerald-100 text-emerald-800", SECONDARY: "bg-slate-100 text-slate-700", AMBIGUOUS: "bg-amber-100 text-amber-900", EXCLUDED: "bg-slate-200 text-slate-500" };
const REVIEW_TONE: Record<string, string> = { PENDING: "bg-slate-100 text-slate-700", APPROVED: "bg-blue-100 text-blue-800", REJECTED: "bg-red-100 text-red-800" };
const MATCH_TONE: Record<string, string> = { NEW: "bg-emerald-50 text-emerald-800", EXISTING_STRONG: "bg-blue-50 text-blue-800", AMBIGUOUS: "bg-amber-100 text-amber-900", BRANCH_OF_EXISTING: "bg-violet-50 text-violet-800" };

const FIT_TONE: Record<string, string> = { VERIFIED_REPAIR: "bg-emerald-100 text-emerald-800", HUMAN_REVIEW: "bg-amber-100 text-amber-900", EXCLUDED: "bg-red-100 text-red-800" };

export function CandidateTable({ locale, rows, approvedCount, province }: { locale: "en" | "fr"; rows: CandidateRow[]; approvedCount: number; province?: string }) {
  const { c, pending, error, notice, run, setNotice } = useRadarAction(locale);
  const k = c.candidates;
  const fitCopy = nationalCopy(locale).fit;
  const [sel, setSel] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const pageIds = rows.map((r) => r.id);
  const allOn = pageIds.length > 0 && pageIds.every((i) => sel.includes(i));
  const toggle = (id: string) => setSel((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  function decide(decision: "APPROVED" | "REJECTED" | "PENDING") {
    run(() => reviewDiscoveryCandidates({ ids: sel, decision, note: note.trim() || null }), (r) => {
      setSel([]);
      setNotice(fill(k.reviewed, { n: r.result.updated, u: r.result.unchanged, b: r.result.blocked, a: r.result.alreadyImported }));
    });
  }
  function importNow() {
    if (!window.confirm(k.importConfirm)) return;
    run(() => importApprovedDiscoveryCandidates(province ? { province } : {}), (r) => setNotice(fill(k.imported, { c: r.result.created, l: r.result.linked, r: r.result.sentToReview, f: r.result.failed })));
  }

  return (
    <div className="space-y-3">
      <div className={`${cardCls} sticky top-0 z-10 space-y-2`} role="region" aria-label={k.title}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="size-5" checked={allOn} onChange={() => setSel(allOn ? [] : pageIds)} />{k.selectAll}</label>
          <span className="text-sm text-slate-600" aria-live="polite">{fill(k.selected, { n: sel.length })}</span>
          <input className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm" placeholder={k.note} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} aria-label={k.note} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} disabled={pending || !sel.length} onClick={() => decide("APPROVED")}>{pending ? k.working : k.approve}</button>
          <button type="button" className={btnSecondary} disabled={pending || !sel.length} onClick={() => decide("REJECTED")}>{k.reject}</button>
          <button type="button" className={btnSecondary} disabled={pending || !sel.length} onClick={() => decide("PENDING")}>{k.undo}</button>
          <button type="button" className={`${btnPrimary} ml-auto bg-emerald-600 hover:bg-emerald-700`} disabled={pending || approvedCount === 0} onClick={importNow}>{fill(k.importBtn, { n: approvedCount })}</button>
        </div>
        <p className="text-xs text-slate-500">{k.noAssign}</p>
        <FormMessage error={error} notice={notice} />
      </div>

      <ul className="space-y-3">
        {rows.map((r) => {
          const place = [r.address, r.city, r.province, r.postalCode].filter(Boolean).join(", ");
          const blocked = !r.eligibility.eligible;
          return (
            <li key={r.id} className={`${cardCls} ${sel.includes(r.id) ? "ring-2 ring-blue-500" : ""}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 size-5 shrink-0" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`${k.select}: ${r.name}`} />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 break-words font-semibold text-slate-900">{r.name}</h3>
                    <Badge tone={r.repairFit ? FIT_TONE[r.repairFit] : "bg-slate-100 text-slate-600"}>{r.repairFit ? fitCopy.values[r.repairFit] : fitCopy.none}</Badge>
                    {r.segment === "HEAVY_DUTY" && <Badge tone="bg-violet-50 text-violet-800">{fitCopy.segments.HEAVY_DUTY}</Badge>}
                    <Badge tone={TIER_TONE[r.tier]}>{k.tiers[r.tier]}</Badge>
                    <Badge tone={REVIEW_TONE[r.reviewState]}>{k.reviewStates[r.reviewState]}</Badge>
                    {r.qualificationLane && <Badge tone={r.qualificationLane === "AUTO_ELIGIBLE" ? "bg-emerald-50 text-emerald-800" : r.qualificationLane === "BLOCKED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}>{c.automation.policy.lanes[r.qualificationLane]}{r.approvedByPolicyVersion ? ` · v${r.approvedByPolicyVersion}` : ""}</Badge>}
                    {r.qualificationReasons.filter((x) => x !== "AUTO_LINK_EXISTING").slice(0, 3).map((x) => <span key={x} className="text-xs text-slate-500">{c.automation.qualification.reasons[x] ?? x}</span>)}
                    {r.importState !== "NOT_IMPORTED" && <Badge tone="bg-emerald-100 text-emerald-800">{k.importStates[r.importState]}</Badge>}
                    {r.changedSinceImport && <Badge tone="bg-amber-100 text-amber-900">{k.changedSinceImport}</Badge>}
                  </div>
                  <dl className="grid gap-x-4 gap-y-1 text-sm text-slate-700 sm:grid-cols-3">
                    <div><dt className="text-xs text-slate-500">{k.colPlace}</dt><dd className="break-words">{place || "—"}</dd></div>
                    <div><dt className="text-xs text-slate-500">{k.colContact}</dt><dd className="break-words">{[r.phone, r.website, r.email].filter(Boolean).join(" · ") || "—"}</dd></div>
                    <div><dt className="text-xs text-slate-500">{k.colClass}</dt><dd>{r.taxonomyPrimary ?? "—"}{r.classReasons.length ? ` · ${r.classReasons.map((x) => k.reasons[x] ?? x).join(", ")}` : ""}<span className="block text-xs text-slate-500">{k.chainSignals[r.chainSignal]}</span></dd></div>
                  </dl>
                  {r.repairFitReasons.length > 0 && <p className="text-xs text-slate-600">{fitCopy.label}: {r.repairFitReasons.map((x) => fitReasonLabel(locale, x)).join(" · ")}</p>}
                  {r.duplicateOfCandidateId && <p className="text-xs text-amber-800">{nationalCopy(locale).diag.DUPLICATE_OF_STAGED}</p>}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={MATCH_TONE[r.matchState]}>{k.matchStates[r.matchState]}</Badge>
                    {r.matchState === "BRANCH_OF_EXISTING" && <span className="text-xs text-slate-500">{fitCopy.branchNote}</span>}
                    {r.match && (r.match.visible
                      ? <Link className="text-xs text-blue-700 underline" href={PLATFORM.salesProspect(r.match.id)}>{k.existingLink}{r.match.name ? `: ${r.match.name}` : ""}</Link>
                      : <span className="text-xs text-slate-500">{k.existingHidden}</span>)}
                    {r.imported?.visible && <Link className="text-xs text-blue-700 underline" href={PLATFORM.salesProspect(r.imported.id)}>{k.existingLink}</Link>}
                    <span className={`text-xs ${blocked ? "text-red-700" : "text-emerald-700"}`}>{blocked ? r.eligibility.reasons.map((x) => k.eligibility[x]).join(" · ") : k.eligibility.eligible}</span>
                  </div>
                  <details className="text-xs text-slate-600">
                    <summary className="min-h-8 cursor-pointer select-none">{k.colQuality} · {k.completeness} {r.completeness}% · {k.provenance}</summary>
                    <div className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2">
                      <p>{r.qualityFlags.map((f) => k.flags[f] ?? f).join(" · ") || "—"}</p>
                      <p>{k.release}: {r.lastSeenRelease} · {k.licenses}: {r.licenses.join(", ") || "—"} · {k.datasets}: {r.datasets.join(", ") || "—"} · {k.confidence}: {r.sourceConfidence === null ? "—" : r.sourceConfidence.toFixed(2)}</p>
                      <p className="italic">{k.unverified}</p>
                      {r.reviewNote && <p>{r.reviewNote}</p>}
                    </div>
                  </details>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
