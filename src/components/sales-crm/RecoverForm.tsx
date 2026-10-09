"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestSalesPasswordRecovery } from "@/actions/sales-identity";
import { ADMIN } from "@/lib/routes";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import { btnPrimary, inputCls, labelCls } from "@/components/sales-crm/ui";

/** Public "forgot password" for sales accounts. The answer is always the same, whatever the address. */
export function RecoverForm({ locale }: { locale: "en" | "fr" }) {
  const c = identityCopy(locale).recover;
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-4 rounded-xl border bg-white p-6" action={(f) => start(async () => { await requestSalesPasswordRecovery(String(f.get("email") ?? "")); setDone(true); })}>
      <h1 className="text-xl font-semibold text-slate-900">{c.title}</h1>
      <p className="text-sm text-slate-600">{c.help}</p>
      {done
        ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{c.done}</p>
        : <>
          <label className={labelCls}>{c.email}<input className={inputCls} type="email" name="email" required maxLength={254} autoComplete="username" disabled={pending} /></label>
          <button className={`${btnPrimary} w-full`} disabled={pending}>{c.submit}</button>
        </>}
      <Link className="inline-flex min-h-11 items-center text-sm text-blue-700" href={ADMIN.login}>{c.back}</Link>
    </form>
  );
}
