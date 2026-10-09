"use client";

import { requestRecoveryEmailChange } from "@/actions/sales-identity";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import { Badge, btnPrimary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export function AccountPanel({ locale, login, recoveryEmail, verified, pendingEmail, mode }: { locale: "en" | "fr"; login: string; recoveryEmail: string | null; verified: boolean; pendingEmail: string | null; mode: string | null }) {
  const c = identityCopy(locale).account;
  const { pending, error, notice, run } = useCrmAction(locale);
  return (
    <div className="space-y-5">
      <section className={cardCls}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">{c.login}</dt><dd className="break-all font-medium text-slate-900">{login}</dd></div>
          {mode && <div><dt className="text-slate-500">{c.mode}</dt><dd className="font-medium text-slate-900">{c.modes[mode] ?? mode}</dd></div>}
          <div className="sm:col-span-2">
            <dt className="text-slate-500">{c.recovery}</dt>
            <dd className="flex flex-wrap items-center gap-2 font-medium text-slate-900"><span className="break-all">{recoveryEmail ?? "—"}</span>
              {recoveryEmail && <Badge tone={verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{verified ? c.verified : c.unverified}</Badge>}</dd>
            {pendingEmail && <p className="mt-1 text-xs text-slate-500">{c.pending} {pendingEmail}</p>}
            <p className="mt-1 text-xs text-slate-500">{c.private}</p>
            {recoveryEmail && !verified && <p className="mt-1 text-xs text-amber-800">{c.verifyHint}</p>}
          </div>
        </dl>
      </section>
      <section className={cardCls} aria-labelledby="chg-h">
        <h2 id="chg-h" className="mb-3 font-semibold text-slate-900">{c.change}</h2>
        <form className="grid gap-3 sm:grid-cols-2" action={(f) => run(
          () => requestRecoveryEmailChange(String(f.get("email") ?? ""), String(f.get("password") ?? "")),
          (r) => { void r; },
        )}>
          <label className={labelCls}>{c.newEmail}<input className={inputCls} type="email" name="email" required maxLength={254} autoComplete="email" disabled={pending} defaultValue={recoveryEmail && !verified ? recoveryEmail : ""} /></label>
          <label className={labelCls}>{c.password}<input className={inputCls} type="password" name="password" required maxLength={128} autoComplete="current-password" disabled={pending} /></label>
          <div className="sm:col-span-2"><FormMessage error={error} notice={notice ?? null} /></div>
          <div className="sm:col-span-2"><button className={btnPrimary} disabled={pending}>{c.send}</button></div>
        </form>
      </section>
    </div>
  );
}
