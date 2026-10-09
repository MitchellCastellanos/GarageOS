"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { acceptSalesInvite } from "@/actions/sales-staff";
import { ADMIN } from "@/lib/routes";
import { crmCopy } from "@/lib/admin-locale/sales-crm";
import { btnPrimary, inputCls, labelCls } from "@/components/sales-crm/ui";

export function InviteForm({ staffId, locale }: { staffId: string; locale: "en" | "fr" }) {
  const i = crmCopy(locale).invite;
  const tokenRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const m = /(?:^#|&)token=([a-f0-9]{64})/.exec(window.location.hash);
    tokenRef.current = m ? m[1] : null;
    // The secret has been captured in memory: remove it from the address bar and history.
    if (m) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  if (done) {
    return <div role="status" className="space-y-4 rounded-xl border bg-white p-6 text-center"><p className="font-medium text-emerald-800">{i.done}</p><Link className={btnPrimary} href={ADMIN.login}>{i.signIn}</Link></div>;
  }
  return (
    <form className="space-y-4 rounded-xl border bg-white p-6" action={(form) => {
      setError(null);
      const password = String(form.get("password") ?? ""), confirm = String(form.get("confirm") ?? "");
      if (password !== confirm) return setError(i.mismatch);
      if (password.length < 10) return setError(i.weak);
      const token = tokenRef.current;
      if (!token) return setError(i.noToken);
      start(async () => {
        try {
          const r = await acceptSalesInvite(staffId, token, password);
          if (r.ok) setDone(true); else setError(r.error === "RATE_LIMITED" ? i.rate : r.error === "WEAK_PASSWORD" ? i.weak : i.invalid);
        } catch { setError(i.invalid); }
      });
    }}>
      <h1 className="text-xl font-semibold text-slate-900">{i.title}</h1>
      <p className="text-sm text-slate-600">{i.help}</p>
      <label className={labelCls}>{i.password}<input className={inputCls} type="password" name="password" required minLength={10} maxLength={128} autoComplete="new-password" disabled={pending} /></label>
      <label className={labelCls}>{i.confirm}<input className={inputCls} type="password" name="confirm" required minLength={10} maxLength={128} autoComplete="new-password" disabled={pending} /></label>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <button className={`${btnPrimary} w-full`} disabled={pending}>{i.submit}</button>
    </form>
  );
}
