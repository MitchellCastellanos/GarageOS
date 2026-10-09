"use client";

import { useState } from "react";
import { addInternalNote, linkThread, markThreadSeen, reassignThread, recordOptOut, retryFailedEmail, setThreadStatus } from "@/actions/sales-inbox";
import { btnPrimary, btnSecondary, btnDanger, inputCls } from "@/components/sales-crm/ui";
import { Msg, useComms } from "@/components/sales-comms/useComms";
import { useEffect } from "react";

interface Props {
  locale: "en" | "fr"; threadId: string; status: "OPEN" | "DONE" | "SPAM"; canReassign: boolean; staff: { id: string; name: string }[]; ownerId: string | null;
  linkedProspect: boolean; prospects: { id: string; name: string }[]; optOutSuspected: boolean; markSeen: boolean;
}

export function ThreadActions({ locale, threadId, status, canReassign, staff, ownerId, linkedProspect, prospects, optOutSuspected, markSeen }: Props) {
  const { t, pending, error, notice, run } = useComms(locale);
  const [target, setTarget] = useState("");
  const [prospect, setProspect] = useState("");
  useEffect(() => { if (markSeen) void markThreadSeen(threadId); }, [markSeen, threadId]);
  return (
    <div className="space-y-3">
      <Msg error={error} notice={notice} />
      {optOutSuspected && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{t.inbox.optOutSuspected}</p>
          <button type="button" className={`${btnDanger} mt-2`} disabled={pending} onClick={() => run(() => recordOptOut(threadId), undefined, t.inbox.optOutDone)}>{t.inbox.recordOptOut}</button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {status === "OPEN" ? <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => setThreadStatus(threadId, "DONE"))}>{t.inbox.markDone}</button>
          : <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => setThreadStatus(threadId, "OPEN"))}>{t.inbox.reopen}</button>}
        {status !== "SPAM" && <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => setThreadStatus(threadId, "SPAM"))}>{t.inbox.markSpam}</button>}
      </div>
      {canReassign && staff.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${inputCls} w-auto max-w-full`} value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t.inbox.reassign}>
            <option value="">{t.inbox.reassignTo}</option>
            {staff.filter((s) => s.id !== ownerId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" className={btnSecondary} disabled={pending || !target} onClick={() => run(() => reassignThread(threadId, target))}>{t.inbox.reassign}</button>
        </div>
      )}
      {!linkedProspect && prospects.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${inputCls} w-auto max-w-full`} value={prospect} onChange={(e) => setProspect(e.target.value)} aria-label={t.inbox.linkToProspect}>
            <option value="">{t.inbox.linkToProspect}</option>
            {prospects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" className={btnSecondary} disabled={pending || !prospect} onClick={() => run(() => linkThread(threadId, prospect, null))}>{t.inbox.linkToProspect}</button>
        </div>
      )}
    </div>
  );
}

export function NoteForm({ locale, threadId }: { locale: "en" | "fr"; threadId: string }) {
  const { t, pending, error, run } = useComms(locale);
  const [body, setBody] = useState("");
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => addInternalNote(threadId, body), () => setBody("")); }}>
      <textarea className={`${inputCls} min-h-20 py-2`} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t.inbox.notePlaceholder} aria-label={t.inbox.notes} maxLength={4000} />
      <Msg error={error} />
      <button className={btnPrimary} disabled={pending || !body.trim()}>{t.inbox.addNote}</button>
    </form>
  );
}

export function RetryButton({ locale, messageId }: { locale: "en" | "fr"; messageId: string }) {
  const { t, pending, error, run } = useComms(locale);
  return (<><button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => retryFailedEmail(messageId))}>{t.inbox.retryFailed}</button><Msg error={error} /></>);
}
