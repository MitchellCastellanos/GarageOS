"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { activateSalesDemoAccount } from "@/actions/sales-demo-conversion";
import { conversionCopy } from "@/lib/admin-locale/sales-demo-conversion";

export function ActivationForm({ demoId, token, existing, signedIn, locale }: { demoId: string; token: string; existing: boolean; signedIn: boolean; locale: string }) {
  const t = conversionCopy(locale); const [pending, startTransition] = useTransition(); const [error, setError] = useState(false);
  if (existing && !signedIn) return <div className="space-y-4"><p>{t.existing}</p><Link className="inline-flex min-h-11 items-center text-blue-700" href={`/admin/login?callbackUrl=${encodeURIComponent(`/activate-demo/${demoId}?lang=${locale}`)}#token=${token}`}>{t.login}</Link></div>;
  return <form className="space-y-4" onSubmit={(e) => {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    startTransition(async () => { try { const result = await activateSalesDemoAccount(demoId, token, form); if (result?.error) setError(true); } catch { setError(true); } });
  }}>
    {!existing && <label className="block space-y-2"><span>{t.password}</span><input type="password" name="password" required minLength={8} maxLength={128} autoComplete="new-password" disabled={pending} className="min-h-11 w-full min-w-0 rounded-lg border px-3 py-2 text-base" /><span className="block text-sm text-slate-600">{t.passwordHint}</span></label>}
    <button disabled={pending} className="min-h-11 w-full rounded-lg bg-blue-600 px-4 py-3 text-white disabled:opacity-50">{pending ? t.pending : t.activate}</button>
    {error && <div className="space-y-2"><p role="alert">{t.invalid}</p><Link className="inline-flex min-h-11 items-center text-blue-700" href="/admin/login?callbackUrl=%2Fadmin%2Factivation-payment">{t.login}</Link></div>}
  </form>;
}
