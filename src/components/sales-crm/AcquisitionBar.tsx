"use client";

import { useState } from "react";
import { confirmAcquisitionChange, previewAcquisitionChange } from "@/actions/sales-acquisition";
import { Badge, btnPrimary, btnSecondary, cardCls, formatDate } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";
import { leadCopy } from "@/lib/admin-locale/sales-lead-engine";

type Preview = Extract<Awaited<ReturnType<typeof previewAcquisitionChange>>, { ok: true }>;

/**
 * FIELD ↔ REMOTE acquisition changes for the prospects ticked in the list (checkboxes carry `form="acq-form"`) or for one
 * prospect (`ids`). Preview first; nothing is written until the previewed batch is confirmed. Never changes an owner.
 */
export function AcquisitionBar({ locale, ids }: { locale: "en" | "fr"; ids?: string[] }) {
  const L = leadCopy(locale).acquisition;
  const { pending, error, notice, run, setError } = useCrmAction(locale);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function selected(form: HTMLFormElement): string[] { return ids ?? (new FormData(form).getAll("ids") as string[]); }
  function start(form: HTMLFormElement, action: "RELEASE_TO_REMOTE" | "RETURN_TO_FIELD") {
    const picked = selected(form);
    if (!picked.length) { setError(L.pickSome); return; }
    setResult(null); setConfirming(false);
    run(() => previewAcquisitionChange(picked, action), (r) => setPreview({ ...r, ids: picked } as Preview));
  }
  const stateText = (r: Preview["rows"][number]) => `${L.mode[r.mode]} · ${L.reason[r.reason]}`;

  return (
    <section className={`${cardCls} space-y-3`} aria-label={L.title}>
      <form id="acq-form" onSubmit={(e) => e.preventDefault()} className="space-y-2">
        <p className="text-xs text-slate-600">{L.ownerKept}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnSecondary} disabled={pending} onClick={(e) => start(e.currentTarget.form!, "RELEASE_TO_REMOTE")}>{L.release}</button>
          <button type="button" className={btnSecondary} disabled={pending} onClick={(e) => start(e.currentTarget.form!, "RETURN_TO_FIELD")}>{L.returnField}</button>
        </div>
      </form>
      <FormMessage error={error} notice={notice ?? result} />
      {preview && (
        <div className="space-y-3" role="region" aria-label={L.preview}>
          <p className="text-sm text-slate-800"><b>{L.eligibleCount.replace("{n}", String(preview.eligible))}</b>{preview.inaccessible > 0 ? ` · ${L.inaccessible.replace("{n}", String(preview.inaccessible))}` : ""}</p>
          {preview.action === "RETURN_TO_FIELD" && <p className="text-xs text-slate-600">{L.returnNote}</p>}
          <ul className="space-y-2 md:hidden">
            {preview.rows.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="break-words font-medium text-slate-900">{r.name}{r.city ? ` · ${r.city}` : ""}</p>
                <p className="text-slate-600">{L.colOwner}: {r.owner ? `${r.owner.name} (${L.mode[r.owner.mode]})` : L.noOwner}</p>
                <p className="text-slate-600">{stateText(r)}{r.deadline ? ` · ${formatDate(r.deadline, locale)}` : ""}{r.activeOpportunity ? ` · ${L.activeOpp}` : ""}</p>
                <p className="mt-1">{r.eligible ? <Badge tone="bg-emerald-100 text-emerald-800">{L.eligible}</Badge> : r.conflicts.map((c) => <Badge key={c} tone="bg-amber-100 text-amber-800">{L.conflict[c] ?? c}</Badge>)}</p>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th scope="col" className="py-1 pr-3">{L.colProspect}</th><th scope="col" className="py-1 pr-3">{L.colOwner}</th><th scope="col" className="py-1 pr-3">{L.colNow}</th><th scope="col" className="py-1 pr-3">{L.colDeadline}</th><th scope="col" className="py-1">{L.colResult}</th></tr></thead>
            <tbody>{preview.rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="py-1 pr-3 break-words">{r.name}{r.city ? ` · ${r.city}` : ""}{r.activeOpportunity && <> <Badge tone="bg-rose-100 text-rose-800">{L.activeOpp}</Badge></>}</td>
                <td className="py-1 pr-3">{r.owner ? `${r.owner.name} (${L.mode[r.owner.mode]})` : <span className="text-slate-500">{L.noOwner}</span>}</td>
                <td className="py-1 pr-3">{stateText(r)}</td><td className="py-1 pr-3">{r.deadline ? formatDate(r.deadline, locale) : "—"}</td>
                <td className="py-1">{r.eligible ? <Badge tone="bg-emerald-100 text-emerald-800">{L.eligible}</Badge> : r.conflicts.map((c) => <Badge key={c} tone="bg-amber-100 text-amber-800">{L.conflict[c] ?? c}</Badge>)}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} disabled={pending || preview.eligible === 0}
              onClick={() => { const p = preview; setConfirming(true); run(() => confirmAcquisitionChange((p as Preview & { ids: string[] }).ids, p.action, p.token), (r) => { setPreview(null); setConfirming(false); setResult(r.alreadyApplied ? L.alreadyApplied : L.applied.replace("{n}", String(r.applied))); }); }}>
              {pending && confirming ? L.confirming : (preview.action === "RELEASE_TO_REMOTE" ? L.confirmRelease : L.confirmReturn).replace("{n}", String(preview.eligible))}
            </button>
            <button className={btnSecondary} disabled={pending} onClick={() => setPreview(null)}>{L.discard}</button>
          </div>
        </div>
      )}
    </section>
  );
}
