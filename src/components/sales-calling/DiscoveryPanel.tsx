"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { saveDiscovery } from "@/actions/sales-workspace";
import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import { crmCopy } from "@/lib/admin-locale/sales-crm";
import { OBJECTION_CODES, type ObjectionCode, type WorkspaceProfile } from "@/lib/voice/workspace-types";
import { Badge, btnPrimary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { wsError, type Locale, type Toast } from "./shared";

/** Current software, pain points (real need definitions), objections. Saved only on an explicit click; never marks the call as dispositioned. */
export function DiscoveryPanel({ c, locale, profile, sessionId, canEdit, notify, onSaved }: {
  c: CallingCopy; locale: Locale; profile: WorkspaceProfile; sessionId: string | null; canEdit: boolean; notify: (t: Toast) => void; onSaved: () => void;
}) {
  const t = c.ws.discovery;
  const crm = crmCopy(locale);
  const [software, setSoftware] = useState(profile.currentSoftware ?? profile.lastDiscovery?.software ?? "");
  const [pains, setPains] = useState<string[]>([]);
  const [objections, setObjections] = useState<ObjectionCode[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const recorded = useMemo(() => new Set(profile.needs.filter((n) => n.severity !== "NONE").map((n) => n.definitionId)), [profile.needs]);
  const label = (d: WorkspaceProfile["needDefinitions"][number]) => (locale === "fr" ? d.labelFr : d.labelEn);

  // Feature suggestions: from the pain points ticked now plus needs already assessed on the prospect. Unknown feature keys fall back to the need label.
  const picked = new Map<string, string>();
  for (const d of profile.needDefinitions) {
    if (!pains.includes(d.id) && !recorded.has(d.id)) continue;
    const name = crm.features[d.suggestedFeature];
    picked.set(name ? `f:${d.suggestedFeature}` : `n:${d.id}`, name ?? label(d));
  }
  const suggestions = [...picked.entries()];

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!software.trim() && !pains.length && !objections.length && !note.trim()) return setError(t.nothing);
    setError(null);
    start(async () => {
      try {
        const r = await saveDiscovery({ prospectId: profile.id, sessionId, currentSoftware: software.trim() || undefined, painPoints: pains, objections, notes: note.trim() || undefined });
        if (!r.ok) { setError(wsError(c, locale, r.error)); return; }
        notify({ kind: "ok", text: t.saved });
        setPains([]); setObjections([]); setNote("");
        onSaved();
      } catch {
        setError(c.unexpected);
      }
    });
  }

  return (
    <section aria-labelledby="discovery-title" className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 id="discovery-title" className="text-base font-semibold text-slate-900">{t.title}</h2>
      {!canEdit && <p className="text-sm text-amber-800">{t.readOnly}</p>}
      <form onSubmit={submit} className="space-y-3">
        <fieldset disabled={!canEdit || pending} className="min-w-0 space-y-3">
          <label className={labelCls}>{t.software}
            <input className={inputCls} value={software} maxLength={120} placeholder={t.softwareHint} onChange={(e) => setSoftware(e.target.value)} />
          </label>
          <fieldset className="min-w-0">
            <legend className="mb-1 text-sm font-medium text-slate-700">{t.painPoints}</legend>
            {profile.needDefinitions.length === 0 ? <p className="text-sm text-slate-500">{t.noDefinitions}</p> : (
              <div className="grid gap-1 sm:grid-cols-2">
                {profile.needDefinitions.map((d) => (
                  <label key={d.id} className={`flex min-h-11 items-center gap-2 rounded-lg border px-2.5 text-sm ${pains.includes(d.id) ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                    <input type="checkbox" className="size-4 shrink-0" checked={pains.includes(d.id)} onChange={() => setPains((l) => toggle(l, d.id))} />
                    <span className="min-w-0 break-words">{label(d)}{recorded.has(d.id) && <span className="ml-1 text-xs text-slate-500">({t.recorded})</span>}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <fieldset className="min-w-0">
            <legend className="mb-1 text-sm font-medium text-slate-700">{t.objections}</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {OBJECTION_CODES.map((o) => (
                <label key={o} className={`flex min-h-11 items-center gap-2 rounded-lg border px-2.5 text-sm ${objections.includes(o) ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                  <input type="checkbox" className="size-4 shrink-0" checked={objections.includes(o)} onChange={() => setObjections((l) => toggle(l, o))} />{t.objectionCodes[o]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className={labelCls}>{t.note}<textarea className={`${inputCls} py-2`} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </fieldset>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        {canEdit && <button className={btnPrimary} disabled={pending}>{pending ? t.saving : t.save}</button>}
      </form>
      <div className="rounded-lg bg-slate-50 p-3">
        <h3 className="text-sm font-semibold text-slate-800">{c.ws.features.title}</h3>
        <p className="text-xs text-slate-500">{c.ws.features.hint}</p>
        {suggestions.length === 0 ? <p className="mt-1 text-sm text-slate-500">{c.ws.features.none}</p> : (
          <ul className="mt-2 flex flex-wrap gap-1">{suggestions.map(([k, v]) => <li key={k}><Badge tone="bg-blue-50 text-blue-800">{v}</Badge></li>)}</ul>
        )}
      </div>
    </section>
  );
}
