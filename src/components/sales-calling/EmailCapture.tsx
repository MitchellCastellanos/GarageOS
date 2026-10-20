"use client";

import { useState, useTransition, type FormEvent } from "react";
import { captureCallEmail } from "@/actions/sales-workspace";
import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import { EMAIL_SCOPES, type CaptureEmailResult, type EmailScope, type WorkspaceProfile } from "@/lib/voice/workspace-types";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { wsError, type Locale } from "./shared";

type Verdict = Extract<CaptureEmailResult, { ok: true }>;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** An address dictated on the call + what the contact asked for. Saving it never sends anything and never records a call outcome. */
export function EmailCapture({ c, locale, profile, sessionId, canEdit, canEmail, onCaptured, onOpenEmail }: {
  c: CallingCopy; locale: Locale; profile: WorkspaceProfile; sessionId: string | null; canEdit: boolean; canEmail: boolean;
  onCaptured: () => void; onOpenEmail: (contactId: string) => void;
}) {
  const t = c.ws.capture;
  const [email, setEmail] = useState("");
  const [contactId, setContactId] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [dm, setDm] = useState(false);
  const [scope, setScope] = useState<EmailScope | "">("");
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [pending, start] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setError(t.invalid);
    if (!scope) return setError(t.scopeRequired);
    setError(null); setVerdict(null);
    start(async () => {
      try {
        const r = await captureCallEmail({ prospectId: profile.id, contactId: contactId || null, name: name.trim() || undefined, title: title.trim() || undefined, email: email.trim(), scope, isDecisionMaker: dm, sessionId });
        if (!r.ok) { setError(wsError(c, locale, r.code)); return; }
        setVerdict(r);
        onCaptured();
      } catch {
        setError(c.unexpected);
      }
    });
  }

  return (
    <section aria-labelledby="capture-title" className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 id="capture-title" className="text-base font-semibold text-slate-900">{t.title}</h2>
      {!canEdit ? <p className="text-sm text-amber-800">{t.readOnly}</p> : (
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`${labelCls} sm:col-span-2`}>{t.email}
              <input className={inputCls} type="email" inputMode="email" autoComplete="off" required value={email} onChange={(e) => { setEmail(e.target.value); setVerdict(null); }} />
            </label>
            <label className={labelCls}>{t.contact}
              <select className={inputCls} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">{t.newContact}</option>
                {profile.contacts.filter((x) => !x.doNotContact).map((x) => <option key={x.id} value={x.id}>{x.name}{x.email ? ` (${x.email})` : ""}</option>)}
              </select>
            </label>
            <label className={labelCls}>{t.name}<input className={inputCls} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></label>
            <label className={labelCls}>{t.contactTitle}<input className={inputCls} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="flex min-h-11 items-center gap-3 self-end text-sm text-slate-700"><input type="checkbox" className="size-4" checked={dm} onChange={(e) => setDm(e.target.checked)} />{t.dm}</label>
          </div>
          <fieldset className="min-w-0">
            <legend className="mb-1 text-sm font-medium text-slate-700">{t.scope} <span className="font-normal text-slate-500">({c.disposition.required})</span></legend>
            <div className="grid gap-1">
              {EMAIL_SCOPES.map((s) => (
                <label key={s} className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm ${scope === s ? "border-blue-500 bg-blue-50 font-medium" : "border-slate-200"}`}>
                  <input type="radio" name="capture-scope" className="size-4" checked={scope === s} onChange={() => { setScope(s); setVerdict(null); }} />{t.scopes[s]}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{t.consentNote}</p>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <button className={btnPrimary} disabled={pending}>{pending ? t.saving : t.save}</button>
        </form>
      )}
      {verdict && (
        <div role="status" className={`space-y-1 rounded-lg border px-3 py-2 text-sm ${verdict.send.allowed ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
          <p>✓ {t.saved}{verdict.basisRecorded ? ` ${t.basisRecorded}` : ""}</p>
          {verdict.send.allowed ? (
            <>
              <p className="font-semibold">{t.ready}</p>
              {canEmail && <button type="button" className={btnSecondary} onClick={() => onOpenEmail(verdict.contactId)}>{t.openEmail}</button>}
            </>
          ) : (
            <>
              <p className="font-semibold">! {t.next[verdict.send.nextAction] ?? verdict.send.nextAction}</p>
              {verdict.send.reason && <p>{t.reasons[verdict.send.reason] ?? ""}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
