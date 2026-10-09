"use client";

import { useState } from "react";
import { reassignStaffWork, resendSalesStaffInvite, setSalesStaffStatus } from "@/actions/sales-staff";
import { btnDanger, btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export function CopyLink({ url, locale }: { url: string; locale: "en" | "fr" }) {
  const { t } = useCrmAction(locale);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${inputCls} font-mono text-xs`} aria-label={t.team.copy} />
      <button type="button" className={btnSecondary} onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* user can select the field */ } }}>
        {copied ? t.team.copied : t.team.copy}
      </button>
    </div>
  );
}

export function StaffActions({ locale, staffId, status, isSelf, others }: {
  locale: "en" | "fr"; staffId: string; status: string; isSelf: boolean; others: { id: string; name: string }[];
}) {
  const { t, pending, error, notice, run } = useCrmAction(locale);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const [moveProspects, setMoveProspects] = useState(true);
  const [moveTasks, setMoveTasks] = useState(true);
  const [counts, setCounts] = useState<{ openProspects: number; openTasks: number } | null>(null);
  const m = t.team;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {status !== "INACTIVE" && (
          <button type="button" className={btnSecondary} disabled={pending} onClick={() => {
            if (!window.confirm(m.resendConfirm)) return;
            run(() => resendSalesStaffInvite(staffId), (r) => setManualUrl((r as { manualInviteUrl: string | null }).manualInviteUrl), m.inviteSent);
          }}>{m.resendInvite}</button>
        )}
        {status === "INACTIVE" && <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => setSalesStaffStatus(staffId, "ACTIVE"), undefined, m.updated)}>{m.reactivate}</button>}
      </div>
      {status === "ACTIVE" && <p className="text-xs text-slate-500">{m.inviteHelpActive}</p>}
      {manualUrl && <div className="space-y-2"><p className="text-sm text-slate-700">{m.inviteManual}</p><CopyLink url={manualUrl} locale={locale} /></div>}

      {status !== "INACTIVE" && !isSelf && (
        <form className="grid gap-3 rounded-lg border border-red-200 bg-red-50/50 p-4" action={() => {
          if (!window.confirm(m.deactivateConfirm)) return;
          run(() => setSalesStaffStatus(staffId, "INACTIVE", reason), (r) => setCounts(r as { openProspects: number; openTasks: number }));
        }}>
          <label className={labelCls}>{m.deactivateReason}<input className={inputCls} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} disabled={pending} /></label>
          <div><button className={btnDanger} disabled={pending}>{m.deactivate}</button></div>
        </form>
      )}
      {counts && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{m.deactivatedNotice} {counts.openProspects} {m.prospectsWord}, {counts.openTasks} {m.tasksWord}.</p>}

      <form className="grid gap-3 rounded-lg border border-slate-200 p-4" action={() => {
        if (!target) return;
        run(() => reassignStaffWork(staffId, target, { prospects: moveProspects, tasks: moveTasks }), undefined, m.reassigned);
      }}>
        <h3 className="text-sm font-semibold text-slate-900">{m.reassignTitle}</h3>
        <p className="text-xs text-slate-500">{m.reassignHelp}</p>
        <label className={labelCls}>{m.reassignTo}
          <select className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)} disabled={pending}><option value="">{t.common.select}</option>{others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={moveProspects} onChange={(e) => setMoveProspects(e.target.checked)} /> {m.reassignProspects}</label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={moveTasks} onChange={(e) => setMoveTasks(e.target.checked)} /> {m.reassignTasks}</label>
        <div><button className={btnSecondary} disabled={pending || !target || (!moveProspects && !moveTasks)}>{m.reassignRun}</button></div>
      </form>
      <FormMessage error={error} notice={notice} />
    </div>
  );
}
