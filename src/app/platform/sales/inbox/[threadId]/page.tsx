import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { can } from "@/domain/sales-crm/access";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { PLATFORM } from "@/lib/routes";
import { Badge, PageHeader, PermissionDenied, btnSecondary, cardCls, formatDate } from "@/components/sales-crm/ui";
import { composeProspects, getThreadDetail } from "@/lib/sales-comms/queries";
import { listAssignableStaff } from "@/lib/sales-crm/queries";
import { InboxRealtime } from "@/components/sales-comms/InboxRealtime";
import { NoteForm, RetryButton, ThreadActions } from "@/components/sales-comms/ThreadActions";
import { Composer, type ComposerInitial } from "@/components/sales-comms/Composer";
import { looksLikeOptOut } from "@/domain/sales-comms/email";
import { stripQuotedReply } from "@/domain/sales-comms/html";
import { getCommsSettings } from "@/lib/sales-comms/settings";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ThreadPage({ params, searchParams }: { params: Promise<{ threadId: string }>; searchParams: Promise<SP> }) {
  const { actor, t: crm, locale } = await loadCrmPage("send_sales_email");
  if (!actor) return <PermissionDenied t={crm} />;
  const t = commsCopy(locale);
  const { threadId } = await params;
  const sp = await searchParams;
  const detail = await getThreadDetail(actor, threadId);
  if (!detail) notFound();
  const { thread, authors } = detail;
  const messages = thread.messages.filter((m) => m.status !== "DRAFT");
  const draft = thread.messages.find((m) => m.status === "DRAFT" && m.authorUserId === actor.userId) ?? null;
  const lastInbound = [...messages].reverse().find((m) => m.direction === "INBOUND" && !m.isAutomated);
  const optOut = !!lastInbound && thread.needsReply && looksLikeOptOut(lastInbound.bodyText ?? "");
  const isOwner = !!actor.staffId && thread.ownerStaffId === actor.staffId;
  const [identity, settings, staff, prospects] = await Promise.all([
    actor.staffId ? db.crmSenderIdentity.findUnique({ where: { staffId: actor.staffId }, include: { staff: { select: { timezone: true, bookingEnabled: true } } } }) : null,
    getCommsSettings(),
    can(actor, "reassign_prospects") ? listAssignableStaff(actor) : [],
    thread.prospectId ? [] : composeProspects(actor),
  ]);
  const replyAll = one(sp.all) === "1";
  const others = replyAll && lastInbound ? [...new Set([...lastInbound.toAddresses, ...lastInbound.ccAddresses])].filter((a) => a !== identity?.fromEmail && a !== thread.counterpartyEmail) : [];
  const initial: ComposerInitial = {
    messageId: draft?.id ?? null, threadId: thread.id, prospectId: thread.prospectId, contactId: thread.contactId, to: draft ? draft.toAddresses.join(", ") : thread.counterpartyEmail ?? "",
    cc: draft ? draft.ccAddresses.join(", ") : others.join(", "), bcc: "", subject: thread.subject, body: draft?.bodyText ?? "", templateKey: "", languageOverride: draft?.languageSource === "override" && (draft.language === "EN" || draft.language === "FR") ? draft.language : "",
  };
  const ownerName = thread.owner ? (thread.owner.displayName ?? thread.owner.user.name) : t.common.unassigned;
  const bodyOf = (m: (typeof messages)[number]) => (m.direction === "INBOUND" ? stripQuotedReply(m.bodyText ?? "") : m.bodyText ?? "");
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href={PLATFORM.salesInbox} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {t.inbox.backToInbox}</Link>
      <PageHeader title={thread.subject || t.inbox.noSubject} subtitle={thread.prospect ? `${thread.prospect.name}${thread.contact ? ` · ${thread.contact.name}` : ""}` : thread.counterpartyEmail ?? undefined}
        actions={thread.prospect ? <Link className={btnSecondary} href={PLATFORM.salesProspect(thread.prospect.id)}>{t.inbox.prospect}</Link> : undefined} />
      <InboxRealtime userId={actor.userId} locale={locale} />
      {thread.prospect?.doNotContact && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{crm.prospects.detail.doNotContactBanner}</p>}
      {!isOwner && <p className="text-sm text-slate-600">{t.inbox.viewing}: <b>{actor.name}</b> · {t.inbox.assignedTo}: {ownerName}</p>}
      <div className="flex flex-wrap gap-1.5 text-xs">
        <Badge>{t.inbox.assignedTo}: {ownerName}</Badge>
        {thread.needsReply && thread.status === "OPEN" && <Badge tone="bg-amber-100 text-amber-800">{t.inbox.needsReplyBadge}</Badge>}
        {thread.status !== "OPEN" && <Badge tone="bg-slate-200 text-slate-700">{thread.status === "DONE" ? t.inbox.filters.done : "Spam"}</Badge>}
        {!thread.prospectId && <Badge tone="bg-slate-200 text-slate-700">{t.inbox.unlinked}</Badge>}
      </div>

      <section className="space-y-3" aria-label={t.inbox.thread}>
        {messages.map((m) => {
          const inbound = m.direction === "INBOUND";
          return (
            <article key={m.id} className={`${cardCls} ${inbound ? "border-blue-200 bg-blue-50/40" : ""}`}>
              <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p className="min-w-0 break-words"><b>{inbound ? (m.fromName ?? m.fromAddress) : (m.fromName ?? thread.identity.fromName)}</b> <span className="text-slate-500">&lt;{m.fromAddress}&gt;</span></p>
                <time className="text-xs text-slate-500" dateTime={m.createdAt.toISOString()}>{formatDate(m.createdAt, locale, true)}</time>
              </header>
              <p className="mt-0.5 break-words text-xs text-slate-500">{t.inbox.to}: {m.toAddresses.join(", ")}{m.ccAddresses.length ? ` · ${t.inbox.cc}: ${m.ccAddresses.join(", ")}` : ""}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                {!inbound && <Badge tone={["FAILED", "BOUNCED", "COMPLAINED"].includes(m.status) ? "bg-red-100 text-red-800" : m.status === "DELIVERED" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}>{t.status[m.status] ?? m.status}</Badge>}
                {!inbound && <Badge tone="bg-slate-50 text-slate-600">{t.category[m.category]}</Badge>}
                {m.isAutomated && <Badge tone="bg-slate-200 text-slate-700">{t.inbox.automated}</Badge>}
                {m.language && !inbound && <Badge tone="bg-blue-50 text-blue-800">{m.language}{m.templateKey ? ` · ${t.templateNames[m.templateKey] ?? m.templateKey} v${m.templateVersion ?? 0}` : ""}</Badge>}
                {m.scheduledFor && m.status === "SCHEDULED" && <Badge tone="bg-violet-100 text-violet-800">{formatDate(m.scheduledFor, locale, true)}</Badge>}
                {authors.get(m.authorUserId ?? "") && <span className="text-slate-500">{t.inbox.sentBy} {authors.get(m.authorUserId ?? "")}</span>}
              </div>
              <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm text-slate-800">{bodyOf(m)}</pre>
              {m.errorMessage && ["FAILED", "BOUNCED"].includes(m.status) && <p role="alert" className="mt-2 text-sm text-red-700">{t.errors[m.errorCode ?? ""] ?? m.errorMessage}</p>}
              {m.status === "FAILED" && !inbound && (m.authorUserId === actor.userId || actor.all) && <div className="mt-2"><RetryButton locale={locale} messageId={m.id} /></div>}
              {m.attachments.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2" aria-label={t.inbox.attachments}>
                  {m.attachments.map((a) => <li key={a.id}><a className="rounded-full bg-slate-100 px-3 py-1 text-sm text-blue-700 hover:underline" href={`/api/sales/attachment/${a.id}`}>{a.filename} · {Math.ceil(a.sizeBytes / 1024)} KB</a></li>)}
                </ul>
              )}
            </article>
          );
        })}
      </section>

      <section className={cardCls}>
        <ThreadActions locale={locale} threadId={thread.id} status={thread.status} canReassign={can(actor, "reassign_prospects")} staff={staff.map((s) => ({ id: s.id, name: s.name }))} ownerId={thread.ownerStaffId}
          linkedProspect={!!thread.prospectId} prospects={prospects.map((p) => ({ id: p.id, name: p.name }))} optOutSuspected={optOut} markSeen={isOwner && !!thread.lastInboundAt && !thread.ownerSeenAt} />
      </section>

      <section className={cardCls} aria-labelledby="notes-h">
        <h2 id="notes-h" className="font-semibold text-slate-900">{t.inbox.notes}</h2>
        <p className="mb-3 text-xs text-slate-500">{t.inbox.notesHint}</p>
        <ul className="mb-3 space-y-2">
          {thread.notes.map((n) => <li key={n.id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm"><p className="whitespace-pre-wrap break-words">{n.body}</p><p className="mt-1 text-xs text-slate-500">{authors.get(n.authorUserId) ?? "GarageOS"} · {formatDate(n.createdAt, locale, true)}</p></li>)}
        </ul>
        <NoteForm locale={locale} threadId={thread.id} />
      </section>

      <section className={cardCls} aria-labelledby="reply-h">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="reply-h" className="font-semibold text-slate-900">{replyAll ? t.inbox.replyAll : t.inbox.reply}</h2>
          {lastInbound && (lastInbound.ccAddresses.length > 0 || lastInbound.toAddresses.length > 1) && !replyAll && <Link className="text-sm text-blue-700 hover:underline" href={`${PLATFORM.salesThread(thread.id)}?all=1`}>{t.inbox.replyAll}</Link>}
        </div>
        {!thread.contactId && !thread.counterpartyEmail
          ? <p className="text-sm text-slate-600">{t.errors.NOT_LINKED}</p>
          : <Composer locale={locale} initial={initial} isReply prospects={[]} templates={[]} sender={identity ? { name: identity.fromName, email: identity.fromEmail } : null} bookingEnabled={!!identity?.staff.bookingEnabled}
              sendReady={!!identity && identity.status === "ACTIVE" && settings.sendingEnabled} timezone={identity?.staff.timezone ?? "America/Toronto"} attachments={[]} />}
        {identity && !identity.inboundVerifiedAt && <p className="mt-3 text-xs text-slate-500">{settings.inboundDomain ? t.inbox.replyPathWarn : t.inbox.inboundOff}</p>}
      </section>
    </div>
  );
}
