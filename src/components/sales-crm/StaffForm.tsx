"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSalesStaff, updateSalesStaff } from "@/actions/sales-staff";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { PLATFORM } from "@/lib/routes";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";
import { CopyLink } from "@/components/sales-crm/StaffActions";
import { SignaturePreview, type SignatureSource } from "@/components/sales-comms/SignaturePreview";

export type StaffSignatureProps = Pick<SignatureSource, "websiteUrl" | "bookingUrl" | "bookingEnabled" | "logoUrl"> & { senderEmail: string | null };

export interface StaffFormValues {
  name?: string; email?: string; role?: string; title?: string | null; phone?: string | null; managerId?: string | null; territories?: string[]; uiLocale?: string; timezone?: string;
  displayName?: string | null; defaultMeetingMinutes?: number; meetingBufferMinutes?: number;
}

export function StaffForm({ locale, staffId, values = {}, managers, signature }: { locale: "en" | "fr"; staffId?: string; values?: StaffFormValues; managers: { id: string; name: string }[]; signature?: StaffSignatureProps }) {
  const { t, pending, error, notice, run } = useCrmAction(locale);
  const router = useRouter();
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [role, setRole] = useState(values.role ?? "SALES_REP");
  const editing = !!staffId;
  // Live values for the signature preview (the inputs stay uncontrolled; the form reports every change).
  const [live, setLive] = useState({ name: values.displayName || values.name || "", title: values.title ?? "", phone: values.phone ?? "", lang: values.uiLocale === "FR" ? "FR" : "EN" });
  const m = t.team;
  if (manualUrl) {
    return (
      <div className="space-y-3" role="status">
        <p className="text-sm font-medium text-emerald-800">{m.created}</p>
        <p className="text-sm text-slate-700">{m.inviteManual}</p>
        <CopyLink url={manualUrl} locale={locale} />
        <button className={btnSecondary} onClick={() => router.push(PLATFORM.salesTeam)}>{t.common.back}</button>
      </div>
    );
  }
  return (
    <form className="grid gap-4 sm:grid-cols-2" onChange={(e) => { const f = new FormData(e.currentTarget); setLive({ name: String(f.get("displayName") || f.get("name") || ""), title: String(f.get("title") ?? ""), phone: String(f.get("phone") ?? ""), lang: f.get("uiLocale") === "FR" ? "FR" : "EN" }); }} action={(form) => run(
      () => (editing ? updateSalesStaff(staffId!, form) : createSalesStaff(form)),
      (r) => {
        if (editing) return;
        const res = r as unknown as { staffId: string; manualInviteUrl: string | null };
        if (res.manualInviteUrl) setManualUrl(res.manualInviteUrl); else router.push(PLATFORM.salesTeamMember(res.staffId));
      },
      editing ? m.updated : undefined,
    )}>
      <label className={labelCls}>{m.name} *<input className={inputCls} name="name" required maxLength={100} defaultValue={values.name} disabled={pending} /></label>
      <label className={labelCls}>{editing ? m.emailFixed : `${t.common.email} *`}
        <input className={inputCls} name="email" type="email" required={!editing} maxLength={254} defaultValue={values.email} readOnly={editing} disabled={pending || editing} />
      </label>
      <label className={labelCls}>{m.role}
        <select className={inputCls} name="role" value={role} onChange={(e) => setRole(e.target.value)} disabled={pending}>
          {Object.entries(t.staffRoles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className={labelCls}>{m.manager}
        <select className={inputCls} name="managerId" defaultValue={values.managerId ?? ""} disabled={pending || role === "SALES_MANAGER"}>
          <option value="">{m.noManager}</option>{managers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <label className={labelCls}>{m.titleField}<input className={inputCls} name="title" maxLength={100} defaultValue={values.title ?? ""} disabled={pending} /></label>
      <label className={labelCls}>{m.phone}<input className={inputCls} name="phone" type="tel" maxLength={30} defaultValue={values.phone ?? ""} disabled={pending} /></label>
      <label className={`${labelCls} sm:col-span-2`}>{m.territories}<input className={inputCls} name="territories" defaultValue={(values.territories ?? []).join(", ")} disabled={pending} /></label>
      <label className={labelCls}>{m.uiLanguage}
        <select className={inputCls} name="uiLocale" defaultValue={values.uiLocale ?? (locale === "fr" ? "FR" : "EN")} disabled={pending}><option value="EN">English</option><option value="FR">Français</option></select>
      </label>
      <label className={labelCls}>{m.timezone}<input className={inputCls} name="timezone" maxLength={60} defaultValue={values.timezone ?? "America/Toronto"} disabled={pending} /></label>

      <fieldset className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:col-span-2 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-slate-900">{m.profileTitle}</legend>
        <p className="text-xs text-slate-500 sm:col-span-2">{m.profileHelp}</p>
        <label className={labelCls}>{m.displayName}<input className={inputCls} name="displayName" maxLength={100} defaultValue={values.displayName ?? ""} disabled={pending} /></label>
        <div className="grid grid-cols-2 gap-4">
          <label className={labelCls}>{m.bookingMinutes}<input className={inputCls} name="defaultMeetingMinutes" type="number" min={5} max={480} defaultValue={values.defaultMeetingMinutes ?? 30} disabled={pending} /></label>
          <label className={labelCls}>{m.bufferMinutes}<input className={inputCls} name="meetingBufferMinutes" type="number" min={0} max={240} defaultValue={values.meetingBufferMinutes ?? 10} disabled={pending} /></label>
        </div>
      </fieldset>

      {signature && (signature.senderEmail
        ? <SignaturePreview locale={locale} src={{ name: live.name, title: live.title, phone: live.phone, email: signature.senderEmail, websiteUrl: signature.websiteUrl, bookingUrl: signature.bookingUrl, bookingEnabled: signature.bookingEnabled, logoUrl: signature.logoUrl, emailLanguage: live.lang as "EN" | "FR" }} />
        : <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">{commsCopy(locale).sig.noEmail}</p>)}

      <div className="sm:col-span-2"><FormMessage error={error} notice={notice} /></div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button className={btnPrimary} disabled={pending}>{pending ? t.common.saving : editing ? m.saveProfile : m.new}</button>
        {!editing && <button type="button" className={btnSecondary} onClick={() => router.back()} disabled={pending}>{t.common.cancel}</button>}
      </div>
    </form>
  );
}
