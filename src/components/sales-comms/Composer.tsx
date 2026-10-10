"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PLATFORM } from "@/lib/routes";
import { attachFile, discardDraft, insertBookingLink, insertVideoLink, loadTemplate, previewEmail, removeAttachment, saveEmailDraft, sendEmail } from "@/actions/sales-inbox";
import { btnPrimary, btnSecondary, btnDanger, inputCls, labelCls } from "@/components/sales-crm/ui";
import { Msg, useComms } from "@/components/sales-comms/useComms";
import { commsError } from "@/lib/admin-locale/sales-comms";

export interface ComposerProspect {
  id: string; name: string; language: "FR" | "EN" | "UNKNOWN";
  contacts: { id: string; name: string; email: string | null; language: "FR" | "EN" | null; basis: "valid" | "none" }[];
}
export interface ComposerInitial {
  messageId: string | null; threadId: string | null; prospectId: string | null; contactId: string | null; to: string; cc: string; bcc: string;
  subject: string; body: string; templateKey: string; languageOverride: "" | "EN" | "FR";
}
interface Props {
  locale: "en" | "fr"; prospects: ComposerProspect[]; templates: { key: string; label: string }[]; initial: ComposerInitial; isReply: boolean;
  sender: { name: string; email: string } | null; bookingEnabled: boolean; sendReady: boolean; timezone: string; attachments: { id: string; filename: string; sizeBytes: number }[];
}

export function Composer({ locale, prospects, templates, initial, isReply, sender, bookingEnabled, sendReady, timezone, attachments: initialAttachments }: Props) {
  const { t, router, pending, error, notice, run, setError, setNotice } = useComms(locale);
  const c = t.composer;
  const [f, setF] = useState(initial);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [preview, setPreview] = useState<{ html: string; text: string; subject: string; blocked: string | null; blockedDetail: string | null; warnings: string[]; language: string | null } | null>(null);
  const [videoKind, setVideoKind] = useState<"commercial" | "teaser">("commercial");
  const [schedule, setSchedule] = useState(false);
  const [when, setWhen] = useState({ date: "", time: "09:00" });
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const set = <K extends keyof ComposerInitial>(k: K, v: ComposerInitial[K]) => setF((s) => ({ ...s, [k]: v }));
  const prospect = useMemo(() => prospects.find((p) => p.id === f.prospectId) ?? null, [prospects, f.prospectId]);
  const contact = prospect?.contacts.find((x) => x.id === f.contactId) ?? null;

  const form = (extra: Record<string, string> = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ messageId: f.messageId ?? "", threadId: f.threadId ?? "", prospectId: f.prospectId ?? "", contactId: f.contactId ?? "", to: f.to, cc: f.cc, bcc: f.bcc, subject: f.subject, bodyText: f.body, templateKey: f.templateKey, languageOverride: f.languageOverride, ...extra })) fd.set(k, v);
    return fd;
  };
  function pickProspect(id: string) {
    const p = prospects.find((x) => x.id === id);
    const first = p?.contacts[0];
    setF((s) => ({ ...s, prospectId: id || null, contactId: first?.id ?? null, to: first?.email ?? "", languageOverride: s.languageOverride }));
  }
  function pickContact(id: string) {
    const ct = prospect?.contacts.find((x) => x.id === id);
    setF((s) => ({ ...s, contactId: id || null, to: ct?.email ?? s.to }));
  }
  async function ensureDraft(): Promise<string | null> {
    const r = await saveEmailDraft(form());
    if (!r.ok) { setError(commsError(t, r.error)); return null; }
    setF((s) => ({ ...s, messageId: r.messageId, threadId: r.threadId }));
    return r.messageId;
  }
  const effectiveLang = f.languageOverride || contact?.language || prospect?.language || "UNKNOWN";

  return (
    <div className="space-y-4">
      {!sender && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.inbox.noIdentityBody}</p>}
      {sender && !sendReady && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"><b>{t.inbox.setupBannerTitle}.</b> {t.inbox.setupBannerBody}</p>}
      <form className="grid gap-4" onSubmit={(e) => e.preventDefault()} aria-label={isReply ? c.replyTitle : c.title}>
        {!isReply && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>{c.prospect}
              <select className={inputCls} value={f.prospectId ?? ""} onChange={(e) => pickProspect(e.target.value)} disabled={!!f.messageId && !!f.threadId && !!initial.messageId}>
                <option value="">{c.chooseContact}</option>
                {prospects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className={labelCls}>{c.contact}
              <select className={inputCls} value={f.contactId ?? ""} onChange={(e) => pickContact(e.target.value)} disabled={!prospect}>
                <option value="">{c.chooseContact}</option>
                {prospect?.contacts.map((x) => <option key={x.id} value={x.id}>{x.name}{x.email ? ` — ${x.email}` : ""}</option>)}
              </select>
            </label>
          </div>
        )}
        {contact && contact.basis === "none" && !isReply && (
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <b>{c.noBasisTitle}.</b> {c.noBasisBody}{" "}
            {prospect && <Link className="font-medium text-blue-700 underline" href={PLATFORM.salesProspect(prospect.id)}>{t.basis.record}</Link>}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={`${labelCls} sm:col-span-3`}>{c.recipients}
            <input className={inputCls} value={f.to} onChange={(e) => set("to", e.target.value)} inputMode="email" autoComplete="off" aria-describedby="to-hint" />
            <span id="to-hint" className="text-xs font-normal text-slate-500">{c.recipientsHint}</span>
          </label>
          <label className={`${labelCls} sm:col-span-3`}>{c.cc}
            <input className={inputCls} value={f.cc} onChange={(e) => set("cc", e.target.value)} inputMode="email" autoComplete="off" />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {prospect && !isReply && (
            <label className={labelCls}>{c.template}
              <select className={inputCls} value={f.templateKey} onChange={(e) => set("templateKey", e.target.value)}>
                <option value="">{c.noTemplate}</option>
                {templates.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </label>
          )}
          <label className={labelCls}>{c.language}
            <select className={inputCls} value={f.languageOverride} onChange={(e) => set("languageOverride", e.target.value as ComposerInitial["languageOverride"])}>
              <option value="">{c.languageAuto} ({effectiveLang === "UNKNOWN" ? t.common.unknown : effectiveLang === "FR" ? t.common.french : t.common.english})</option>
              <option value="EN">{t.common.english}</option><option value="FR">{t.common.french}</option>
            </select>
            {!isReply && effectiveLang === "UNKNOWN" && <span className="text-xs font-normal text-amber-700">{c.languageNeeded}</span>}
          </label>
          {f.templateKey && prospect && !isReply && (
            <div className="flex items-end">
              <button type="button" className={`${btnSecondary} w-full`} disabled={pending} onClick={() => run(
                () => loadTemplate(form({ templateKey: f.templateKey })), (r) => { const x = r as unknown as { subject: string; body: string }; setF((s) => ({ ...s, subject: x.subject, body: x.body })); }, undefined, false)}>{c.applyTemplate}</button>
            </div>
          )}
        </div>
        <label className={labelCls}>{c.subject}
          <input className={inputCls} value={f.subject} onChange={(e) => set("subject", e.target.value)} maxLength={300} disabled={isReply} />
        </label>
        <label className={labelCls}>{c.body}
          <textarea ref={bodyRef} className={`${inputCls} min-h-56 py-2 leading-relaxed`} value={f.body} onChange={(e) => set("body", e.target.value)} maxLength={20000} />
        </label>
        <p className="text-xs text-slate-500">{c.signature} {c.unsubscribeNote}</p>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnSecondary} disabled={pending || !bookingEnabled} title={bookingEnabled ? undefined : c.bookingDisabled}
            onClick={() => run(() => insertBookingLink(form({ language: f.languageOverride })), (r) => { const url = (r as unknown as { url: string }).url; setF((s) => ({ ...s, body: `${s.body}${s.body && !s.body.endsWith("\n") ? "\n" : ""}${url}` })); }, undefined, false)}>{c.insertBooking}</button>
          {!isReply && (
            <span className="flex items-center gap-1" title={c.videoHint}>
              <select aria-label={c.insertVideo} className={`${inputCls} w-auto`} value={videoKind} onChange={(e) => setVideoKind(e.target.value as "commercial" | "teaser")} disabled={pending}>
                <option value="commercial">{c.videoCommercial}</option><option value="teaser">{c.videoTeaser}</option>
              </select>
              <button type="button" className={btnSecondary} disabled={pending || !f.prospectId || effectiveLang === "UNKNOWN"} title={!f.prospectId ? c.videoNeedsProspect : effectiveLang === "UNKNOWN" ? c.languageNeeded : c.videoHint}
                onClick={() => run(() => insertVideoLink(form({ kind: videoKind, language: effectiveLang })), (r) => { const url = (r as unknown as { url: string }).url; setF((s) => ({ ...s, body: `${s.body}${s.body && !s.body.endsWith("\n") ? "\n" : ""}${url}` })); }, undefined, false)}>{c.insertVideo}</button>
            </span>
          )}
          <label className={`${btnSecondary} cursor-pointer`}>
            {c.attach}
            <input type="file" className="sr-only" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={async (e) => {
              const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
              setError(null);
              const id = await ensureDraft(); if (!id) return;
              const fd = new FormData(); fd.set("file", file);
              const r = await attachFile(id, fd);
              if (!r.ok) setError(commsError(t, r.error)); else setAttachments((a) => [...a, { id: (r as { attachmentId: string }).attachmentId, filename: (r as { filename: string }).filename, sizeBytes: (r as { sizeBytes: number }).sizeBytes }]);
            }} />
          </label>
          <span className="text-xs text-slate-500">{c.attachHint}</span>
        </div>
        {attachments.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label={t.inbox.attachments}>
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm">
                <span className="max-w-48 truncate">{a.filename}</span><span className="text-xs text-slate-500">{Math.ceil(a.sizeBytes / 1024)} KB</span>
                <button type="button" className="text-red-700 hover:underline" onClick={async () => { const r = await removeAttachment(a.id); if (r.ok) setAttachments((x) => x.filter((y) => y.id !== a.id)); }}>{c.removeFile}</button>
              </li>
            ))}
          </ul>
        )}

        {schedule && (
          <div className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-3">
            <label className={labelCls}>{c.scheduleAt}<input type="date" className={inputCls} value={when.date} onChange={(e) => setWhen((w) => ({ ...w, date: e.target.value }))} /></label>
            <label className={labelCls}>{t.common.time}<input type="time" className={inputCls} value={when.time} onChange={(e) => setWhen((w) => ({ ...w, time: e.target.value }))} /></label>
            <p className="self-end pb-2 text-xs text-slate-500">{timezone}</p>
          </div>
        )}

        <Msg error={error} notice={notice} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnPrimary} disabled={pending || !sender || (schedule && !when.date)} onClick={() => run(
            () => sendEmail(form(schedule ? { scheduleDate: when.date, scheduleTime: when.time } : {})),
            (r) => { const x = r as unknown as { threadId: string; status: string }; setNotice(x.status === "SCHEDULED" ? c.scheduled : x.status === "SENT" ? c.sent : c.queued); router.push(PLATFORM.salesThread(x.threadId)); }, undefined, false)}>
            {pending ? c.sending : schedule ? c.schedule : c.send}
          </button>
          <button type="button" className={btnSecondary} disabled={pending || !sender} onClick={() => setSchedule((s) => !s)} aria-pressed={schedule}>{c.schedule}</button>
          <button type="button" className={btnSecondary} disabled={pending || !sender} onClick={() => run(
            () => previewEmail(form()), (r) => {
              const x = r as unknown as { messageId: string; threadId: string; html: string | null; text: string | null; subject: string | null; blocked: string | null; blockedDetail: string | null; warnings: string[]; language: string | null };
              setF((s) => ({ ...s, messageId: x.messageId, threadId: x.threadId }));
              setPreview({ html: x.html ?? "", text: x.text ?? "", subject: x.subject ?? "", blocked: x.blocked, blockedDetail: x.blockedDetail, warnings: x.warnings, language: x.language });
            }, undefined, false)}>{c.preview}</button>
          <button type="button" className={btnSecondary} disabled={pending || !sender} onClick={() => run(() => saveEmailDraft(form()), (r) => { const x = r as unknown as { messageId: string; threadId: string }; setF((s) => ({ ...s, messageId: x.messageId, threadId: x.threadId })); setNotice(c.draftSaved); }, c.draftSaved, false)}>{c.saveDraft}</button>
          {f.messageId && <button type="button" className={btnDanger} disabled={pending} onClick={() => run(() => discardDraft(f.messageId!), () => router.push(PLATFORM.salesInbox), undefined, false)}>{c.discard}</button>}
        </div>
      </form>

      {preview && (
        <div role="dialog" aria-modal="true" aria-label={c.previewTitle} className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-6">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0"><h2 className="font-semibold text-slate-900">{c.previewTitle}</h2><p className="truncate text-sm text-slate-600">{preview.subject}</p></div>
              <button type="button" className={btnSecondary} onClick={() => setPreview(null)}>{c.closePreview}</button>
            </div>
            <div className="space-y-3 overflow-y-auto p-4">
              {preview.blocked && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{c.previewBlocked} {commsError(t, preview.blocked)}{preview.blockedDetail ? ` (${preview.blockedDetail})` : ""}</p>}
              {preview.warnings.length > 0 && <ul className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><li className="font-medium">{c.warnings}</li>{preview.warnings.map((w) => <li key={w}>• {c.warn[w] ?? w}</li>)}</ul>}
              {sender && <p className="text-sm text-slate-600">{c.sender}: <b>{sender.name}</b> &lt;{sender.email}&gt;</p>}
              {/* sandbox="" ⇒ no scripts, no forms, no same-origin: the preview cannot execute anything. */}
              <iframe title={c.previewTitle} sandbox="" srcDoc={preview.html} className="h-[28rem] w-full rounded-lg border border-slate-200 bg-slate-100" />
              <details><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-slate-700">{c.previewText}</summary><pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{preview.text}</pre></details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
