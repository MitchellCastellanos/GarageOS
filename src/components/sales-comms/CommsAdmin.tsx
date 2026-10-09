"use client";

import { useState } from "react";
import { addManualSuppression, approveTemplate, liftEmailSuppression, saveCommsSettings, saveSenderIdentity, setSenderStatus } from "@/actions/sales-comms-admin";
import { btnPrimary, btnSecondary, btnDanger, inputCls, labelCls } from "@/components/sales-crm/ui";
import { Msg, useComms } from "@/components/sales-comms/useComms";

export interface SettingsView {
  sendingEnabled: boolean; approvedDomains: string[]; inboundDomain: string | null; legalName: string; mailingAddress: string | null; contactEmail: string | null; contactPhone: string | null; websiteUrl: string;
  defaultDailyLimit: number; sendWindowStartHour: number; sendWindowEndHour: number; minNoticeMinutes: number; maxAdvanceDays: number;
}

export function CommsSettingsForm({ locale, s }: { locale: "en" | "fr"; s: SettingsView }) {
  const { t, pending, error, notice, run } = useComms(locale);
  const m = t.comms;
  const [on, setOn] = useState(s.sendingEnabled);
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (on) fd.set("sendingEnabled", "on"); else fd.delete("sendingEnabled"); run(() => saveCommsSettings(fd), undefined, m.settingsSaved); }}>
      <label className={`flex min-h-11 items-center gap-2 rounded-lg border p-3 text-sm font-medium sm:col-span-2 ${on ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />{m.master}: {on ? m.masterOn : m.masterOff}
      </label>
      <label className={`${labelCls} sm:col-span-2`}>{m.approvedDomains}<textarea name="approvedDomains" className={`${inputCls} min-h-16 py-2`} defaultValue={s.approvedDomains.join("\n")} /><span className="text-xs font-normal text-slate-500">{m.approvedDomainsHint}</span></label>
      <label className={`${labelCls} sm:col-span-2`}>{m.inboundDomain}<input name="inboundDomain" className={inputCls} defaultValue={s.inboundDomain ?? ""} /><span className="text-xs font-normal text-slate-500">{m.inboundHint}</span></label>
      <label className={labelCls}>{m.legalName}<input name="legalName" className={inputCls} defaultValue={s.legalName} required /></label>
      <label className={labelCls}>{m.website}<input name="websiteUrl" type="url" className={inputCls} defaultValue={s.websiteUrl} required /></label>
      <label className={`${labelCls} sm:col-span-2`}>{m.mailingAddress}<input name="mailingAddress" className={inputCls} defaultValue={s.mailingAddress ?? ""} maxLength={300} /></label>
      <label className={labelCls}>{m.contactEmail}<input name="contactEmail" type="email" className={inputCls} defaultValue={s.contactEmail ?? ""} /></label>
      <label className={labelCls}>{m.contactPhone}<input name="contactPhone" className={inputCls} defaultValue={s.contactPhone ?? ""} /></label>
      <label className={labelCls}>{m.dailyLimit}<input name="defaultDailyLimit" type="number" min={0} max={500} className={inputCls} defaultValue={s.defaultDailyLimit} /></label>
      <label className={labelCls}>{m.maxAdvance}<input name="maxAdvanceDays" type="number" min={1} max={365} className={inputCls} defaultValue={s.maxAdvanceDays} /></label>
      <label className={labelCls}>{m.windowStart}<input name="sendWindowStartHour" type="number" min={0} max={23} className={inputCls} defaultValue={s.sendWindowStartHour} /></label>
      <label className={labelCls}>{m.windowEnd}<input name="sendWindowEndHour" type="number" min={1} max={24} className={inputCls} defaultValue={s.sendWindowEndHour} /></label>
      <label className={labelCls}>{m.minNotice}<input name="minNoticeMinutes" type="number" min={0} className={inputCls} defaultValue={s.minNoticeMinutes} /></label>
      <div className="sm:col-span-2"><Msg error={error} notice={notice} /></div>
      <div className="sm:col-span-2"><button className={btnPrimary} disabled={pending}>{pending ? t.common.saving : m.saveSettings}</button></div>
    </form>
  );
}

export function IdentityForm({ locale, staff, initial }: { locale: "en" | "fr"; staff: { id: string; name: string; hasIdentity: boolean }[]; initial?: { staffId: string; fromName: string; fromEmail: string; replyToEmail: string; jobTitle: string; phone: string; signatureText: string; defaultLanguage: string; dailyLimit: string } }) {
  const { t, pending, error, notice, run } = useComms(locale);
  const m = t.comms;
  const [staffId, setStaffId] = useState(initial?.staffId ?? staff.find((s) => !s.hasIdentity)?.id ?? staff[0]?.id ?? "");
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("staffId", staffId); run(() => saveSenderIdentity(fd), undefined, t.common.save); }}>
      <label className={`${labelCls} sm:col-span-2`}>{m.seller}<select className={inputCls} value={staffId} onChange={(e) => setStaffId(e.target.value)}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.hasIdentity ? " ✓" : ""}</option>)}</select></label>
      <label className={labelCls}>{m.displayName}<input name="fromName" className={inputCls} defaultValue={initial?.fromName} required maxLength={100} placeholder="Alexandre Tremblay" /></label>
      <label className={labelCls}>{m.fromEmail}<input name="fromEmail" type="email" className={inputCls} defaultValue={initial?.fromEmail} required placeholder="alexandre@sales.garage-os.ca" /></label>
      <label className={labelCls}>{m.replyTo}<input name="replyToEmail" type="email" className={inputCls} defaultValue={initial?.replyToEmail} /></label>
      <label className={labelCls}>{m.jobTitle}<input name="jobTitle" className={inputCls} defaultValue={initial?.jobTitle} maxLength={120} placeholder="Sales Representative — GarageOS" /></label>
      <label className={labelCls}>{m.phone}<input name="phone" className={inputCls} defaultValue={initial?.phone} maxLength={40} /></label>
      <label className={labelCls}>{m.defaultLanguage}<select name="defaultLanguage" className={inputCls} defaultValue={initial?.defaultLanguage ?? "EN"}><option value="EN">{t.common.english}</option><option value="FR">{t.common.french}</option></select></label>
      <label className={labelCls}>{m.dailyLimitOverride}<input name="dailyLimit" type="number" min={0} max={500} className={inputCls} defaultValue={initial?.dailyLimit} /></label>
      <label className={`${labelCls} sm:col-span-2`}>{m.signature}<textarea name="signatureText" className={`${inputCls} min-h-24 py-2`} defaultValue={initial?.signatureText} maxLength={1200} /><span className="text-xs font-normal text-slate-500">{m.signatureHint}</span></label>
      <div className="sm:col-span-2"><Msg error={error} notice={notice} /></div>
      <div className="sm:col-span-2"><button className={btnPrimary} disabled={pending || !staffId}>{pending ? t.common.saving : m.saveIdentity}</button></div>
    </form>
  );
}

export function IdentityStatusActions({ locale, identityId, status }: { locale: "en" | "fr"; identityId: string; status: string }) {
  const { t, pending, error, run } = useComms(locale);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status !== "ACTIVE" && <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => setSenderStatus(identityId, "ACTIVE"))}>{t.comms.activate}</button>}
        {status === "ACTIVE" && <button type="button" className={btnDanger} disabled={pending} onClick={() => run(() => setSenderStatus(identityId, "DISABLED"))}>{t.comms.disable}</button>}
        <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(async () => ({ ok: true }))}>{t.comms.recheck}</button>
      </div>
      <Msg error={error} />
    </div>
  );
}

export function TemplateEditor({ locale, keyName, language, subject, body, name, versionLabel }: { locale: "en" | "fr"; keyName: string; language: "EN" | "FR"; subject: string; body: string; name: string; versionLabel: string }) {
  const { t, pending, error, notice, run } = useComms(locale);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name, subject, body });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm"><b>{language === "FR" ? t.common.french : t.common.english}</b> · {versionLabel}</span><button type="button" className={btnSecondary} onClick={() => setOpen(!open)}>{t.comms.editTemplate}</button></div>
      <p className="line-clamp-1 break-words text-xs text-slate-500">{subject}</p>
      {open && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(); fd.set("key", keyName); fd.set("language", language); fd.set("name", f.name); fd.set("subject", f.subject); fd.set("bodyText", f.body); run(() => approveTemplate(fd), () => setOpen(false), t.comms.approved); }}>
          <label className={labelCls}>{t.comms.templateName}<input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} maxLength={120} /></label>
          <label className={labelCls}>{t.comms.templateSubject}<input className={inputCls} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} required maxLength={200} /></label>
          <label className={labelCls}>{t.comms.templateBody}<textarea className={`${inputCls} min-h-56 py-2 font-mono text-sm`} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required /></label>
          <p className="text-xs text-slate-500">{t.comms.templateHint}</p>
          <button className={btnPrimary} disabled={pending}>{t.comms.approve}</button>
        </form>
      )}
      <Msg error={error} notice={notice} />
    </div>
  );
}

export function SuppressionForm({ locale }: { locale: "en" | "fr" }) {
  const { t, pending, error, run } = useComms(locale);
  const [email, setEmail] = useState("");
  return (
    <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(); fd.set("email", email); run(() => addManualSuppression(fd), () => setEmail("")); }}>
      <input type="email" className={`${inputCls} flex-1`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.comms.address} aria-label={t.comms.addSuppression} required />
      <button className={btnSecondary} disabled={pending}>{t.comms.addSuppression}</button>
      <div className="basis-full"><Msg error={error} /></div>
    </form>
  );
}

export function LiftButton({ locale, id }: { locale: "en" | "fr"; id: string }) {
  const { t, pending, error, run } = useComms(locale);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  if (!open) return <button type="button" className={btnSecondary} onClick={() => setOpen(true)}>{t.comms.lift}</button>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className={`${inputCls} w-64 max-w-full`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.comms.liftReason} aria-label={t.comms.liftReason} />
      <button type="button" className={btnDanger} disabled={pending} onClick={() => run(() => liftEmailSuppression(id, note), () => setOpen(false))}>{t.comms.lift}</button>
      <Msg error={error} />
    </div>
  );
}
