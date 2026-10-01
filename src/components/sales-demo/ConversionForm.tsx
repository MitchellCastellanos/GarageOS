"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendSalesDemoActivation } from "@/actions/sales-demo-conversion";
import { conversionCopy } from "@/lib/admin-locale/sales-demo-conversion";
import { PLANS, PLAN_LABELS, type Plan } from "@/config/entitlements";
import type { BillingInterval } from "@/domain/subscription-state";

export function ConversionForm({ demoId, ownerName, ownerEmail, plan, interval, sent, activated, locale }: {
  demoId: string; ownerName: string; ownerEmail: string; plan: Plan; interval: BillingInterval; sent: boolean; activated: boolean; locale: string;
}) {
  const t = conversionCopy(locale); const router = useRouter();
  const [pending, startTransition] = useTransition(); const [message, setMessage] = useState("");
  const field = "min-h-11 w-full min-w-0 rounded-lg border bg-white px-3 py-2 text-base";
  if (activated) return <p>{t.sent}</p>;
  return <form className="space-y-5" onSubmit={(e) => {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    startTransition(async () => { try { const result = await sendSalesDemoActivation(demoId, form, sent); setMessage(result.error === "cooldown" ? t.cooldown : result.error ? t.error : t.sent); router.refresh(); } catch { setMessage(t.error); } });
  }}>
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      <label className="block space-y-1"><span>{t.ownerName}</span><input className={field} name="ownerName" defaultValue={ownerName} required maxLength={100} autoComplete="name" /></label>
      <label className="block space-y-1"><span>{t.ownerEmail}</span><input className={field} name="ownerEmail" defaultValue={ownerEmail} required type="email" maxLength={254} autoComplete="email" autoCapitalize="none" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1"><span>{t.plan}</span><select className={field} name="plan" defaultValue={plan}>{PLANS.map((p) => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}</select></label>
        <label className="block space-y-1"><span>{t.interval}</span><select className={field} name="interval" defaultValue={interval}><option value="MONTHLY">{t.monthly}</option><option value="YEARLY">{t.yearly}</option></select></label>
      </div>
      <p className="text-sm text-slate-600">{t.stays}</p>
      <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" name="retainScenario" value="yes" required className="mt-1 h-5 w-5 shrink-0" /><span>{t.retain}</span></label>
      <button className="min-h-11 w-full rounded-lg bg-blue-600 px-4 py-3 text-white disabled:opacity-50" disabled={pending}>{pending ? t.pending : sent ? t.resend : t.send}</button>
    </fieldset>
    <p role="status" className="break-words text-sm">{message || (sent ? t.sent : "")}</p>
  </form>;
}
