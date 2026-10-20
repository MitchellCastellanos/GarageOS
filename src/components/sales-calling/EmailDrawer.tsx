"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { getEmailContext, recordDemoSent } from "@/actions/sales-workspace";
import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import type { EmailComposeContext } from "@/lib/voice/workspace-types";
import { Composer, type ComposerHandle, type ComposerInitial, type ComposerInsert, type ComposerSent } from "@/components/sales-comms/Composer";
import { btnSecondary } from "@/components/sales-crm/ui";
import { clock, type Softphone } from "./useSoftphone";
import { fill, wsError, type Locale, type Toast } from "./shared";

export type InsertKind = ComposerInsert;
export interface EmailDrawerHandle { open: (req?: { insert?: InsertKind | null; contactId?: string | null }) => void; refresh: () => void }

const DEMO_LINK_RE = /\/demo(?:\/booking)?(?:[\s?#]|$)|\/watch\//;

/**
 * Non-blocking right-side drawer (aria-modal=false) so the softphone stays usable. Once opened it stays MOUNTED (hidden when closed), so an unsent draft
 * survives panel switches; the workspace remounts it only when another prospect is loaded (after confirming a dirty draft).
 */
export const EmailDrawer = forwardRef<EmailDrawerHandle, {
  c: CallingCopy; locale: Locale; prospectId: string; prospectName: string; sp: Softphone;
  onDirtyChange: (d: boolean) => void; onDemoSent: () => void; notify: (t: Toast) => void; onOpenChange?: (open: boolean) => void;
}>(function EmailDrawer({ c, locale, prospectId, prospectName, sp, onDirtyChange, onDemoSent, notify, onOpenChange }, ref) {
  const t = c.ws.drawer;
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<EmailComposeContext | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [dirty, setDirty] = useState(false);
  const queue = useRef<{ insert?: InsertKind | null; contactId?: string | null }[]>([]);
  const composer = useRef<ComposerHandle>(null);
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const loading = useRef(false);

  const load = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    getEmailContext(prospectId)
      .then((r) => { if (r.ok) { setCtx(r.context); setFailed(null); } else setFailed(wsError(c, locale, r.code)); })
      .catch(() => setFailed(t.failed))
      .finally(() => { loading.current = false; setTick((x) => x + 1); });
  }, [prospectId, c, locale, t.failed]);

  useImperativeHandle(ref, () => ({
    open(req) {
      if (!open) returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (req) queue.current.push(req);
      setOpen(true);
      onOpenChange?.(true);
      setTick((x) => x + 1);
      if (!ctx) load();
    },
    refresh() { if (ctx) load(); },
  }));

  // Flush queued insert / contact requests once the composer is mounted (refs are attached before effects run).
  useEffect(() => {
    if (!ctx || !composer.current) return;
    const pending = queue.current.splice(0);
    for (const r of pending) {
      if (r.contactId && ctx.prospect.contacts.some((x) => x.id === r.contactId)) composer.current.selectContact(r.contactId);
      if (r.insert) composer.current.insert(r.insert);
    }
  }, [tick, ctx]);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
  }, [open]);

  const dirtyChange = useCallback((d: boolean) => { setDirty(d); onDirtyChange(d); }, [onDirtyChange]);

  function close(ask: boolean) {
    if (ask && dirty && !window.confirm(t.confirmClose)) return;
    setOpen(false);
    onOpenChange?.(false);
    const back = returnTo.current;
    if (back && document.contains(back)) back.focus();
  }

  function sent(r: ComposerSent) {
    if (r.status === "FAILED") return;
    if (!DEMO_LINK_RE.test(r.bodyText)) return;
    recordDemoSent(prospectId, r.messageId)
      .then((x) => { if (x.ok) { onDemoSent(); notify({ kind: "ok", text: t.demoRecorded }); } else if (x.error !== "NO_DEMO_LINK") notify({ kind: "error", text: wsError(c, locale, x.error) }); })
      .catch(() => undefined);
  }

  const first = ctx?.prospect.contacts[0] ?? null;
  const initial: ComposerInitial | null = ctx ? {
    messageId: null, threadId: null, prospectId: ctx.prospect.id, contactId: first?.id ?? null, to: first?.email ?? "", cc: "", bcc: "", subject: "", body: "", templateKey: "", languageOverride: "",
  } : null;

  return (
    <div ref={panel} role="dialog" aria-modal="false" aria-labelledby="email-drawer-title" tabIndex={-1} aria-hidden={!open || undefined}
      onKeyDown={(e) => { if (e.key === "Escape" && !(e.target as HTMLElement).closest("[aria-modal='true']")) { e.stopPropagation(); close(true); } }}
      className={`${open ? "flex" : "hidden"} fixed inset-y-0 right-0 z-40 w-full max-w-full flex-col border-l border-slate-200 bg-white shadow-2xl focus:outline-none sm:w-[40rem] lg:w-[62vw] lg:max-w-[60rem]`}>
      {sp.isLive && (
        <div className="flex items-center justify-between gap-2 bg-emerald-700 px-4 py-2 text-sm text-white" role="status">
          <span className="font-medium">● {fill(t.callStrip, { time: clock(sp.seconds) })}{sp.muted ? ` · ${c.softphone.muted}` : ""}</span>
          <span className="flex gap-2">
            <button type="button" className="inline-flex min-h-11 items-center rounded-lg bg-white/15 px-3 font-medium hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white" disabled={sp.phase !== "connected"} aria-pressed={sp.muted} onClick={sp.toggleMute}>{sp.muted ? c.softphone.unmute : c.softphone.mute}</button>
            <button type="button" className="inline-flex min-h-11 items-center rounded-lg bg-red-600 px-3 font-semibold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-white" onClick={sp.hangUp}>{t.hangUp}</button>
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 id="email-drawer-title" className="min-w-0 truncate text-base font-semibold text-slate-900">{fill(t.title, { name: prospectName })}</h2>
        <button type="button" className={`${btnSecondary} shrink-0`} onClick={() => close(false)}>{t.close}</button>
      </div>
      {/* Bottom padding below lg keeps Send / Preview / Save clear of the softphone bar; on lg the phone docks left of the drawer instead. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-32 lg:pb-4">
        {!ctx && !failed && <p role="status" className="text-sm text-slate-600">{t.loading}</p>}
        {failed && !ctx && (
          <div role="alert" className="space-y-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            <p>{t.failed} {failed !== t.failed ? failed : ""}</p>
            <button type="button" className={btnSecondary} onClick={load}>{t.retry}</button>
          </div>
        )}
        {ctx && initial && (
          <Composer
            locale={locale} initial={initial} isReply={false} prospects={[ctx.prospect]} templates={ctx.templates} sender={ctx.sender} bookingEnabled={ctx.bookingEnabled} sendReady={ctx.sendReady} timezone={ctx.timezone} attachments={[]}
            embedded={{
              handleRef: composer, demoLinks: ctx.demoLinks, onDirtyChange: dirtyChange, onSent: sent, onClose: () => close(false),
              labels: { shortVideo: t.shortVideo, fullVideo: t.fullVideo, demo: t.demo, demoBooking: t.demoBooking, newEmail: t.newEmail, result: t.result, errorCode: t.errorCode },
            }}
          />
        )}
      </div>
    </div>
  );
});
