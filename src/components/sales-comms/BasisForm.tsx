"use client";

import { useState } from "react";
import { recordSendingBasis, revokeSendingBasis } from "@/actions/sales-inbox";
import { btnPrimary, btnSecondary, btnDanger, inputCls, labelCls } from "@/components/sales-crm/ui";
import { Msg, useComms } from "@/components/sales-comms/useComms";
import { EVIDENCE_TYPES, evidenceGaps, requiresApproval } from "@/domain/sales-crm/casl-evidence";
import { leadCopy } from "@/lib/admin-locale/sales-lead-engine";

const KINDS = ["EXPRESS_CONSENT", "IMPLIED_EXISTING_RELATIONSHIP", "IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS", "EXEMPT"] as const;

export function BasisForm({ locale, contactId, hasBasis }: { locale: "en" | "fr"; contactId: string; hasBasis: boolean }) {
  const { t, pending, error, run } = useComms(locale);
  const [open, setOpen] = useState(false);
  const L = leadCopy(locale).evidence;
  const [f, setF] = useState({ kind: "IMPLIED_PUBLISHED_ADDRESS", evidence: "", expiresAt: "", evidenceType: "", sourceUrl: "", capturedAt: "", supportingFacts: "", roleRelevance: "", publishedConditionsConfirmed: false });
  const structured = requiresApproval(f.kind);
  const gaps = structured ? evidenceGaps({ kind: f.kind, evidenceType: f.evidenceType || null, sourceUrl: f.sourceUrl || null, capturedAt: f.capturedAt ? new Date(f.capturedAt) : null, supportingFacts: f.supportingFacts.trim() || null, roleRelevance: f.roleRelevance.trim() || null, publishedConditionsConfirmed: f.publishedConditionsConfirmed }) : [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnSecondary} onClick={() => setOpen(!open)}>{t.basis.record}</button>
        {hasBasis && <button type="button" className={btnDanger} disabled={pending} onClick={() => run(() => revokeSendingBasis(contactId))}>{t.basis.revoke}</button>}
      </div>
      <Msg error={error} />
      {open && (
        <form className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(); fd.set("contactId", contactId); fd.set("kind", f.kind); fd.set("evidence", f.evidence); fd.set("expiresAt", f.expiresAt);
          if (structured) { for (const k of ["evidenceType", "sourceUrl", "capturedAt", "supportingFacts", "roleRelevance"] as const) fd.set(k, f[k]); if (f.publishedConditionsConfirmed) fd.set("publishedConditionsConfirmed", "on"); }
          run(() => recordSendingBasis(fd), () => { setOpen(false); setF({ ...f, evidence: "" }); }); }}>
          <label className={labelCls}>{t.basis.kind}<select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map((k) => <option key={k} value={k}>{t.basis.kinds[k]}</option>)}</select></label>
          <label className={labelCls}>{t.basis.evidence}<textarea className={`${inputCls} min-h-20 py-2`} value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} minLength={12} maxLength={1000} required /></label>
          {structured && (
            <fieldset className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <legend className="px-1 text-xs font-semibold text-slate-700">{L.form.structured}</legend>
              <label className={labelCls}>{L.type} *<select className={inputCls} value={f.evidenceType} onChange={(e) => setF({ ...f, evidenceType: e.target.value })} required><option value="">—</option>{EVIDENCE_TYPES.map((x) => <option key={x} value={x}>{L.types[x]}</option>)}</select></label>
              <label className={labelCls}>{L.sourceUrl}{f.kind === "IMPLIED_PUBLISHED_ADDRESS" ? " *" : ""}<input type="url" inputMode="url" className={inputCls} value={f.sourceUrl} maxLength={480} onChange={(e) => setF({ ...f, sourceUrl: e.target.value })} required={f.kind === "IMPLIED_PUBLISHED_ADDRESS"} /></label>
              <label className={labelCls}>{L.capturedAt} *<input type="date" className={inputCls} value={f.capturedAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, capturedAt: e.target.value })} required /></label>
              <label className={labelCls}>{L.facts} *<textarea className={`${inputCls} min-h-20 py-2`} value={f.supportingFacts} maxLength={1500} onChange={(e) => setF({ ...f, supportingFacts: e.target.value })} required /></label>
              <label className={labelCls}>{L.role} *<textarea className={`${inputCls} min-h-16 py-2`} value={f.roleRelevance} maxLength={500} onChange={(e) => setF({ ...f, roleRelevance: e.target.value })} required /></label>
              {f.kind === "IMPLIED_PUBLISHED_ADDRESS" && <label className="flex min-h-11 items-start gap-2 text-sm text-slate-700"><input type="checkbox" className="mt-1 h-4 w-4" checked={f.publishedConditionsConfirmed} onChange={(e) => setF({ ...f, publishedConditionsConfirmed: e.target.checked })} /> {L.publishedOk} *</label>}
              <p className="text-xs text-slate-500">{L.form.submitNote}</p>
            </fieldset>
          )}
          <label className={labelCls}>{t.basis.expires} ({t.common.optional})<input type="date" className={inputCls} value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></label>
          <p className="text-xs text-slate-500">{t.basis.hint}</p>
          <button className={btnPrimary} disabled={pending || f.evidence.trim().length < 12 || gaps.length > 0}>{t.basis.record}</button>
        </form>
      )}
    </div>
  );
}
