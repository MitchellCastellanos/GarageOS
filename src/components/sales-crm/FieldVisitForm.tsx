"use client";

import { logFieldVisit } from "@/actions/sales-platform-settings";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import { btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export function FieldVisitForm({ locale, prospectId }: { locale: "en" | "fr"; prospectId: string }) {
  const c = identityCopy(locale).visit;
  const { pending, error, notice, run } = useCrmAction(locale);
  return (
    <form className="grid gap-2" action={(f) => run(() => logFieldVisit(prospectId, String(f.get("note") ?? "")), undefined, c.done)}>
      <p className="text-xs text-slate-500">{c.help}</p>
      <label className={labelCls}>{c.note}<textarea className={`${inputCls} py-2`} name="note" rows={2} required minLength={3} maxLength={2000} disabled={pending} /></label>
      <FormMessage error={error} notice={notice ?? null} />
      <div><button className={btnSecondary} disabled={pending}>{c.log}</button></div>
    </form>
  );
}
