"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { archiveProspect, markDoNotContact, reinstateProspect, restoreProspect } from "@/actions/sales-prospects";
import { assignProspect } from "@/actions/sales-pipeline";
import { btnDanger, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";
import { PLATFORM } from "@/lib/routes";

export function ProspectActions({ locale, prospectId, archived, doNotContact, isSuperAdmin }: {
  locale: "en" | "fr"; prospectId: string; archived: boolean; doNotContact: boolean; isSuperAdmin: boolean;
}) {
  const { t, pending, error, run } = useCrmAction(locale);
  const router = useRouter();
  const [dnc, setDnc] = useState(false);
  const d = t.prospects.detail;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnSecondary} onClick={() => router.push(`${PLATFORM.salesProspect(prospectId)}/edit`)}>{t.common.edit}</button>
        {archived
          ? <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => restoreProspect(prospectId))}>{d.restore}</button>
          : <button type="button" className={btnSecondary} disabled={pending} onClick={() => { if (window.confirm(d.archiveConfirm)) run(() => archiveProspect(prospectId)); }}>{d.archive}</button>}
        {!doNotContact && <button type="button" className={btnDanger} disabled={pending} onClick={() => setDnc((v) => !v)}>{d.markDnc}</button>}
        {doNotContact && isSuperAdmin && <button type="button" className={btnSecondary} disabled={pending} onClick={() => { if (window.confirm(d.reinstateConfirm)) run(() => reinstateProspect(prospectId)); }}>{d.reinstate}</button>}
      </div>
      {dnc && !doNotContact && (
        <form className="grid gap-2 rounded-lg border border-red-200 bg-red-50 p-3" action={(form) => {
          if (!window.confirm(d.dncConfirm)) return;
          run(() => markDoNotContact(prospectId, String(form.get("note") ?? "")), () => setDnc(false));
        }}>
          <label className={labelCls}>{d.dncReason}<input className={inputCls} name="note" required maxLength={1000} disabled={pending} /></label>
          <div className="flex gap-2"><button className={btnDanger} disabled={pending}>{d.markDnc}</button><button type="button" className={btnSecondary} onClick={() => setDnc(false)}>{t.common.cancel}</button></div>
        </form>
      )}
      <FormMessage error={error} />
    </div>
  );
}

export function AssignControl({ locale, prospectId, staff, currentId }: { locale: "en" | "fr"; prospectId: string; staff: { id: string; name: string }[]; currentId: string | null }) {
  const { t, pending, error, run } = useCrmAction(locale);
  const [value, setValue] = useState(currentId ?? "");
  return (
    <form className="flex flex-wrap items-end gap-2" action={() => run(() => assignProspect(prospectId, value || null), undefined, t.common.saved)}>
      <label className={`${labelCls} min-w-48 flex-1`}>{t.prospects.detail.reassignTo}
        <select className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} disabled={pending}>
          <option value="">{t.common.unassigned}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <button className={btnSecondary} disabled={pending || value === (currentId ?? "")}>{t.prospects.detail.reassign}</button>
      <div className="w-full"><FormMessage error={error} /></div>
    </form>
  );
}
