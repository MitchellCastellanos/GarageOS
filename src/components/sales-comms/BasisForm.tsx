"use client";

import { useState } from "react";
import { recordSendingBasis, revokeSendingBasis } from "@/actions/sales-inbox";
import { btnPrimary, btnSecondary, btnDanger, inputCls, labelCls } from "@/components/sales-crm/ui";
import { Msg, useComms } from "@/components/sales-comms/useComms";

const KINDS = ["EXPRESS_CONSENT", "IMPLIED_EXISTING_RELATIONSHIP", "IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS", "EXEMPT"] as const;

export function BasisForm({ locale, contactId, hasBasis }: { locale: "en" | "fr"; contactId: string; hasBasis: boolean }) {
  const { t, pending, error, run } = useComms(locale);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: "IMPLIED_PUBLISHED_ADDRESS", evidence: "", expiresAt: "" });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnSecondary} onClick={() => setOpen(!open)}>{t.basis.record}</button>
        {hasBasis && <button type="button" className={btnDanger} disabled={pending} onClick={() => run(() => revokeSendingBasis(contactId))}>{t.basis.revoke}</button>}
      </div>
      <Msg error={error} />
      {open && (
        <form className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(); fd.set("contactId", contactId); fd.set("kind", f.kind); fd.set("evidence", f.evidence); fd.set("expiresAt", f.expiresAt); run(() => recordSendingBasis(fd), () => { setOpen(false); setF({ ...f, evidence: "" }); }); }}>
          <label className={labelCls}>{t.basis.kind}<select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map((k) => <option key={k} value={k}>{t.basis.kinds[k]}</option>)}</select></label>
          <label className={labelCls}>{t.basis.evidence}<textarea className={`${inputCls} min-h-20 py-2`} value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} minLength={12} maxLength={1000} required /></label>
          <label className={labelCls}>{t.basis.expires} ({t.common.optional})<input type="date" className={inputCls} value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></label>
          <p className="text-xs text-slate-500">{t.basis.hint}</p>
          <button className={btnPrimary} disabled={pending || f.evidence.trim().length < 12}>{t.basis.record}</button>
        </form>
      )}
    </div>
  );
}
