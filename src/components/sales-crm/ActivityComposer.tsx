"use client";

import { useState } from "react";
import { logActivity } from "@/actions/sales-activities";
import { btnPrimary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export function ActivityComposer({ locale, prospectId, contacts }: { locale: "en" | "fr"; prospectId: string; contacts: { id: string; name: string }[] }) {
  const { t, pending, error, notice, run } = useCrmAction(locale);
  const [type, setType] = useState("NOTE");
  const [key, setKey] = useState(0);
  return (
    <form key={key} className="grid gap-3 sm:grid-cols-2" action={(form) => run(() => logActivity(prospectId, form), () => setKey((k) => k + 1), t.activities.logged)}>
      <label className={labelCls}>{t.activities.type}
        <select className={inputCls} name="type" value={type} onChange={(e) => setType(e.target.value)} disabled={pending}>
          {["NOTE", "CALL", "MEETING", "EMAIL_LOGGED"].map((k) => <option key={k} value={k}>{t.activityTypes[k]}</option>)}
        </select>
      </label>
      {type === "CALL" ? (
        <label className={labelCls}>{t.activities.outcome}
          <select className={inputCls} name="outcome" defaultValue="" disabled={pending}>
            <option value="">{t.common.none}</option>{Object.entries(t.outcomes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      ) : <div className="hidden sm:block" />}
      <label className={labelCls}>{t.activities.contact}
        <select className={inputCls} name="contactId" defaultValue="" disabled={pending}>
          <option value="">{t.common.none}</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className={labelCls}>{t.activities.subject}<input className={inputCls} name="subject" maxLength={150} disabled={pending} /></label>
      <label className={`${labelCls} sm:col-span-2`}>{t.activities.body}
        <textarea className={`${inputCls} min-h-24 py-2`} name="body" maxLength={4000} disabled={pending} />
      </label>
      <div className="sm:col-span-2"><FormMessage error={error} notice={notice} /></div>
      <div className="sm:col-span-2"><button className={btnPrimary} disabled={pending}>{pending ? t.common.saving : t.activities.logIt}</button></div>
    </form>
  );
}
