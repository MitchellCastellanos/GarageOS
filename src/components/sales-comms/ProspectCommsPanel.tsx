import Link from "next/link";
import { db } from "@/lib/db";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { evaluateSendingBasis } from "@/domain/sales-comms/casl";
import { PLATFORM } from "@/lib/routes";
import { Badge, btnPrimary, btnSecondary, cardCls, formatDate } from "@/components/sales-crm/ui";
import { BasisForm } from "@/components/sales-comms/BasisForm";
import { EnrollForm, EnrollmentActions } from "@/components/sales-comms/EnrollmentActions";
import { prospectComms } from "@/lib/sales-comms/queries";
import { activeSuppressions } from "@/lib/sales-comms/suppression";

/**
 * Communications card of the prospect page: CASL basis per contact, conversation list, meetings and sequence enrollment.
 * Everything is scoped: the page already proved the actor may see this prospect; threads/meetings re-apply their own scope.
 */
export async function ProspectCommsPanel({ actor, prospectId, locale, language }: { actor: PlatformSalesActor; prospectId: string; locale: "en" | "fr"; language: "FR" | "EN" | "UNKNOWN" }) {
  const t = commsCopy(locale);
  const now = new Date();
  const [contacts, comms] = await Promise.all([
    db.crmContact.findMany({ where: { prospectId, archivedAt: null }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }], select: { id: true, name: true, email: true, emailNormalized: true, doNotContact: true, preferredLanguage: true, sendingBases: { orderBy: { recordedAt: "desc" }, take: 5 } } }),
    prospectComms(actor, prospectId),
  ]);
  const supp = await activeSuppressions(contacts.map((c) => c.emailNormalized).filter((e): e is string => !!e));
  const enrollable = contacts.filter((c) => c.emailNormalized && !c.doNotContact);
  return (
    <section className={`${cardCls} space-y-5`} aria-labelledby="comms-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="comms-h" className="font-semibold text-slate-900">{t.nav.comms}</h2>
        <div className="flex flex-wrap gap-2">
          <Link className={btnPrimary} href={`${PLATFORM.salesCompose}?prospect=${prospectId}`}>{t.inbox.compose}</Link>
          <Link className={btnSecondary} href={`${PLATFORM.salesCalendar}?new=1&prospect=${prospectId}`}>{t.calendar.newMeeting}</Link>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">{t.basis.title}</h3>
        <ul className="space-y-3">
          {contacts.map((c) => {
            const ev = evaluateSendingBasis(c.sendingBases, now);
            const s = c.emailNormalized ? supp.get(c.emailNormalized) : undefined;
            return (
              <li key={c.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm"><b className="break-words">{c.name}</b><span className="break-all text-slate-500">{c.email ?? "—"}</span>
                  {!c.email ? null : ev.valid ? <Badge tone="bg-emerald-100 text-emerald-800">{t.basis.kinds[ev.kind]}{ev.expiresAt ? ` · ${t.basis.expires} ${formatDate(ev.expiresAt, locale)}` : ""}</Badge> : <Badge tone="bg-amber-100 text-amber-800">{ev.reason === "NONE" ? t.basis.none : ev.reason === "EXPIRED" ? t.basis.expired : ev.reason === "REVOKED" ? t.basis.revoked : t.basis.weak}</Badge>}
                  {s && <Badge tone="bg-red-100 text-red-800">{t.comms.suppressionReasons[s]}</Badge>}
                </div>
                {c.email && <div className="mt-2"><BasisForm locale={locale} contactId={c.id} hasBasis={c.sendingBases.some((b) => !b.revokedAt)} /></div>}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">{t.inbox.thread}</h3>
        {comms.threads.length === 0 ? <p className="text-sm text-slate-500">{t.inbox.empty}</p> : (
          <ul className="space-y-1 text-sm">{comms.threads.map((th) => <li key={th.id}><Link className="text-blue-700 hover:underline" href={PLATFORM.salesThread(th.id)}>{th.subject || t.inbox.noSubject}</Link> <span className="text-xs text-slate-500">· {formatDate(th.lastMessageAt, locale, true)}</span> {th.needsReply && <Badge tone="bg-amber-100 text-amber-800">{t.inbox.needsReplyBadge}</Badge>}</li>)}</ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">{t.calendar.title}</h3>
        {comms.meetings.length === 0 ? <p className="text-sm text-slate-500">{t.calendar.noMeetings}</p> : (
          <ul className="space-y-1 text-sm">{comms.meetings.map((m) => <li key={m.id}>{formatDate(m.startsAt, locale, true)} · {t.calendar.types[m.type]} · <Badge>{t.calendar.statuses[m.status]}</Badge>{m.outcome ? ` ${t.calendar.outcomes[m.outcome]}` : ""}</li>)}</ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">{t.outreach.title}</h3>
        {comms.enrollments.length > 0 && (
          <ul className="mb-3 space-y-2 text-sm">{comms.enrollments.map((e) => (
            <li key={e.id} className="rounded-lg bg-slate-50 p-2"><span className="font-medium">{e.sequence.name}</span> · {e.contact.name} · <Badge>{t.outreach.state[e.status]}</Badge>
              {e.stopReason && <span className="text-xs text-slate-500"> {t.outreach.stopReasons[e.stopReason.split(":")[0]] ?? e.stopReason}</span>}
              <div className="mt-1"><EnrollmentActions locale={locale} id={e.id} status={e.status} /></div></li>))}</ul>
        )}
        {enrollable.length > 0 && <EnrollForm locale={locale} prospectId={prospectId} contacts={enrollable.map((c) => ({ id: c.id, name: c.name }))} sequences={comms.sequences} defaultLanguageKnown={language !== "UNKNOWN"} />}
      </div>
    </section>
  );
}
