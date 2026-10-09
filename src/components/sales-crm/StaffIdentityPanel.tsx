"use client";

import { adminRequestRecoveryEmail } from "@/actions/sales-identity";
import { assignCorporateEmail } from "@/actions/sales-staff";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import { Badge, btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

/** Super Admin view of one agent's identity: corporate login, recovery status, legacy migration, safe recovery change. */
export function StaffIdentityPanel({ locale, staffId, login, corporate, recoveryEmail, verified, pendingEmail }: { locale: "en" | "fr"; staffId: string; login: string; corporate: boolean; recoveryEmail: string | null; verified: boolean; pendingEmail: string | null }) {
  const c = identityCopy(locale);
  const { pending, error, notice, run } = useCrmAction(locale);
  return (
    <div className="space-y-4 text-sm">
      <p><span className="text-slate-500">{c.team.login}: </span><b className="break-all">{login}</b></p>
      <p className="flex flex-wrap items-center gap-2"><span className="text-slate-500">{c.team.recoveryStatus}: </span><span className="break-all font-medium">{recoveryEmail ?? "—"}</span>
        {recoveryEmail && <Badge tone={verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{verified ? c.account.verified : c.account.unverified}</Badge>}
        {pendingEmail && <span className="text-xs text-slate-500">{c.account.pending} {pendingEmail}</span>}</p>
      <p className="text-xs text-slate-500">{c.team.identityAuto}</p>
      {!corporate && (
        <form className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3" action={(f) => run(() => assignCorporateEmail(staffId, String(f.get("corporate") ?? "")), undefined, c.team.legacyDone)}>
          <p className="font-medium text-amber-900">{c.team.legacyTitle}</p><p className="text-xs text-amber-900">{c.team.legacyHelp}</p>
          <input className={inputCls} type="email" name="corporate" required maxLength={254} placeholder="name@garage-os.ca" disabled={pending} aria-label={c.team.login} />
          <div><button className={btnPrimary} disabled={pending}>{c.team.legacyBtn}</button></div>
        </form>
      )}
      <form className="grid gap-2 sm:max-w-md" action={(f) => run(() => adminRequestRecoveryEmail(staffId, String(f.get("recovery") ?? "")), undefined, c.team.changeRecoveryDone)}>
        <label className={labelCls}>{c.team.changeRecovery}<input className={inputCls} type="email" name="recovery" required maxLength={254} disabled={pending} /></label>
        <div><button className={btnSecondary} disabled={pending}>{c.account.send}</button></div>
      </form>
      <FormMessage error={error} notice={notice ?? null} />
    </div>
  );
}
