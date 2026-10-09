import Link from "next/link";
import { db } from "@/lib/db";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { PLATFORM } from "@/lib/routes";
import { getAppUrl } from "@/config/app";
import { Badge, EmptyState, PageHeader, PermissionDenied, btnSecondary, cardCls, formatDate } from "@/components/sales-crm/ui";
import { getCommsSettings } from "@/lib/sales-comms/settings";
import { getAllIdentitySetups } from "@/lib/sales-comms/setup";
import { TEMPLATE_KEYS, builtinTemplate, type TemplateLanguage } from "@/domain/sales-comms/templates";
import { CommsSettingsForm, IdentityForm, IdentityStatusActions, LiftButton, SuppressionForm, TemplateEditor } from "@/components/sales-comms/CommsAdmin";

const ago = (ms: number) => new Date(Date.now() - ms); // module-level helper: pages must not call impure functions inline
const ahead = () => new Date();

export default async function CommsSettingsPage() {
  const { actor, t: crm, locale } = await loadCrmPage("manage_sender_identities");
  if (!actor) return <PermissionDenied t={crm} />;
  const t = commsCopy(locale);
  const m = t.comms;
  const since24 = ago(24 * 3_600_000);
  const since7d = ago(7 * 86_400_000);
  const [settings, setups, staff, templates, suppressions, problems, unrouted, counts, upcoming, bookings7d] = await Promise.all([
    getCommsSettings(), getAllIdentitySetups(),
    db.platformSalesStaff.findMany({ where: { status: "ACTIVE" }, include: { user: { select: { name: true } }, senderIdentity: { select: { id: true } } }, orderBy: { createdAt: "asc" } }),
    db.crmEmailTemplate.findMany({ where: { active: true }, orderBy: { version: "desc" } }),
    db.crmEmailSuppression.findMany({ where: { liftedAt: null }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.crmEmailMessage.findMany({ where: { direction: "OUTBOUND", status: { in: ["FAILED", "BOUNCED", "COMPLAINED"] }, updatedAt: { gte: since7d } }, orderBy: { updatedAt: "desc" }, take: 15, select: { id: true, threadId: true, status: true, errorCode: true, errorMessage: true, toAddresses: true, subject: true, updatedAt: true, identity: { select: { fromName: true } } } }),
    db.crmEmailDeliveryEvent.count({ where: { type: "inbound.unrouted", createdAt: { gte: since7d } } }),
    Promise.all([
      db.crmEmailMessage.count({ where: { direction: "OUTBOUND", status: { in: ["SENT", "DELIVERED"] }, sentAt: { gte: since24 } } }),
      db.crmEmailMessage.count({ where: { direction: "OUTBOUND", status: "FAILED", updatedAt: { gte: since24 } } }),
      db.crmEmailMessage.count({ where: { direction: "OUTBOUND", status: "BOUNCED", updatedAt: { gte: since24 } } }),
      db.crmEmailMessage.count({ where: { direction: "OUTBOUND", status: { in: ["QUEUED", "SENDING", "SCHEDULED"] } } }),
    ]),
    db.crmMeeting.findMany({ where: { status: "SCHEDULED", startsAt: { gt: ahead() } }, orderBy: { startsAt: "asc" }, take: 10, include: { staff: { select: { displayName: true, user: { select: { name: true } } } } } }),
    db.crmMeeting.count({ where: { createdAt: { gte: since7d } } }),
  ]);
  const latest = new Map<string, (typeof templates)[number]>();
  for (const x of templates) { const k = `${x.key}:${x.language}`; if (!latest.has(k)) latest.set(k, x); }
  const webhook = `${getAppUrl()}/api/webhooks/resend`;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={m.title} subtitle={m.subtitle} actions={<><Link className={btnSecondary} href={PLATFORM.salesOutreach}>{m.tabs.sequences}</Link><Link className={btnSecondary} href={PLATFORM.salesInbox}>{t.nav.inbox}</Link></>} />
      <nav className="flex flex-wrap gap-2 text-sm" aria-label={m.title}>{["setup", "templates", "suppression", "activity"].map((k) => <a key={k} className="rounded-full bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200" href={`#${k}`}>{m.tabs[k]}</a>)}</nav>

      <section id="setup" className={`${cardCls} space-y-5`} aria-labelledby="setup-h">
        <h2 id="setup-h" className="font-semibold text-slate-900">{m.settingsTitle}</h2>
        <CommsSettingsForm locale={locale} s={{ sendingEnabled: settings.sendingEnabled, approvedDomains: settings.approvedDomains, inboundDomain: settings.inboundDomain, legalName: settings.legalName, mailingAddress: settings.mailingAddress, contactEmail: settings.contactEmail, contactPhone: settings.contactPhone, websiteUrl: settings.websiteUrl, defaultDailyLimit: settings.defaultDailyLimit, sendWindowStartHour: settings.sendWindowStartHour, sendWindowEndHour: settings.sendWindowEndHour, minNoticeMinutes: settings.minNoticeMinutes, maxAdvanceDays: settings.maxAdvanceDays }} />
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><p className="font-medium">{m.dnsTitle}</p><p className="mt-1">{m.dnsBody}</p><p className="mt-2 break-all"><b>{m.webhookUrl}:</b> <code>{webhook}</code></p></div>

        <h3 className="font-semibold text-slate-900">{m.identities}</h3>
        {setups.length === 0 ? <EmptyState title={m.noIdentities} /> : (
          <ul className="space-y-3">
            {setups.map(({ identity, setup }) => (
              <li key={identity.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0"><p className="break-words font-medium">{identity.fromName} <span className="font-normal text-slate-500">&lt;{identity.fromEmail}&gt;</span></p><p className="text-xs text-slate-500">{m.seller}: {identity.staff.displayName ?? identity.staff.user.name}</p></div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={identity.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{m.identityStatus[identity.status]}</Badge>
                    <Badge tone={setup.state.headline === "READY" ? "bg-emerald-100 text-emerald-800" : setup.state.headline === "SEND_ONLY" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"}>{setup.state.headline === "READY" ? m.ready : setup.state.headline === "SEND_ONLY" ? m.sendOnly : m.blocked}</Badge>
                    <Badge tone={setup.state.roundTripVerified ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}>{m.roundTrip}: {setup.state.roundTripVerified ? m.roundTripOk : m.roundTripNo}</Badge>
                  </div>
                </div>
                {setup.lookupError && <p role="alert" className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">{m.lookupFailed} {setup.lookupError}</p>}
                <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  {setup.state.steps.map((s) => <li key={s.key} className={s.ok ? "text-emerald-800" : "text-rose-800"}><span aria-hidden>{s.ok ? "✓" : "✗"}</span> <span className="sr-only">{s.ok ? t.common.yes : t.common.no}: </span>{m.setup[s.key]}{!s.ok && s.hint ? <span className="text-xs text-slate-500"> ({s.hint})</span> : null}</li>)}
                </ul>
                <div className="mt-3"><IdentityStatusActions locale={locale} identityId={identity.id} status={identity.status} /></div>
                <details className="mt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-blue-700">{t.common.edit}</summary>
                  <IdentityForm locale={locale} staff={staff.map((s) => ({ id: s.id, name: s.displayName ?? s.user.name, hasIdentity: !!s.senderIdentity }))}
                    initial={{ staffId: identity.staffId, fromName: identity.fromName, fromEmail: identity.fromEmail, replyToEmail: identity.replyToEmail ?? "", jobTitle: identity.jobTitle ?? "", phone: identity.phone ?? "", signatureText: identity.signatureText ?? "", defaultLanguage: identity.defaultLanguage, dailyLimit: identity.dailyLimit?.toString() ?? "" }} />
                </details>
              </li>
            ))}
          </ul>
        )}
        <details open={setups.length === 0}><summary className="min-h-11 cursor-pointer py-2 font-medium text-blue-700">{m.newIdentity}</summary>
          <IdentityForm locale={locale} staff={staff.map((s) => ({ id: s.id, name: s.displayName ?? s.user.name, hasIdentity: !!s.senderIdentity }))} />
        </details>
      </section>

      <section id="templates" className={`${cardCls} space-y-4`} aria-labelledby="tpl-h">
        <h2 id="tpl-h" className="font-semibold text-slate-900">{m.templates}</h2>
        {TEMPLATE_KEYS.map((key) => (
          <div key={key} className="rounded-xl border border-slate-200 p-3"><h3 className="mb-2 font-medium text-slate-900">{t.templateNames[key]}</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {(["EN", "FR"] as TemplateLanguage[]).map((lang) => {
                const row = latest.get(`${key}:${lang}`); const b = builtinTemplate(key, lang)!;
                return <TemplateEditor key={lang} locale={locale} keyName={key} language={lang} name={row?.name ?? t.templateNames[key]} subject={row?.subject ?? b.subject} body={row?.bodyText ?? b.body} versionLabel={row ? `${m.approvedBy} ${row.version}` : m.builtin} />;
              })}
            </div>
          </div>
        ))}
      </section>

      <section id="suppression" className={`${cardCls} space-y-3`} aria-labelledby="sup-h">
        <h2 id="sup-h" className="font-semibold text-slate-900">{m.suppression}</h2>
        <p className="text-sm text-slate-600">{m.suppressionHint}</p>
        <SuppressionForm locale={locale} />
        {suppressions.length === 0 ? <p className="text-sm text-slate-500">{m.noSuppression}</p> : (
          <ul className="space-y-2">{suppressions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="min-w-0 break-all"><b>{s.emailNormalized}</b> · {m.suppressionReasons[s.reason]} · {s.source} · {formatDate(s.createdAt, locale)}</span>
              <LiftButton locale={locale} id={s.id} />
            </li>))}</ul>
        )}
      </section>

      <section id="activity" className={`${cardCls} space-y-3`} aria-labelledby="act-h">
        <h2 id="act-h" className="font-semibold text-slate-900">{m.activity}</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-6">
          {[[m.sentToday, counts[0]], [m.failed, counts[1]], [m.bounced, counts[2]], [m.queued, counts[3]], [m.unrouted, unrouted], [m.bookings7d, bookings7d]].map(([label, n]) => <div key={String(label)} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="text-xl font-semibold">{n}</dd></div>)}
        </dl>
        <h3 className="font-medium text-slate-900">{m.recentProblems}</h3>
        {problems.length === 0 ? <p className="text-sm text-slate-500">{m.noProblems}</p> : (
          <ul className="space-y-2">{problems.map((p) => <li key={p.id} className="rounded-lg bg-rose-50 px-3 py-2 text-sm"><Link className="font-medium text-blue-700 hover:underline" href={PLATFORM.salesThread(p.threadId)}>{p.subject || t.inbox.noSubject}</Link> · {p.identity.fromName} → {p.toAddresses.join(", ")} · <b>{t.status[p.status]}</b> {p.errorCode ? `· ${t.errors[p.errorCode] ?? p.errorCode}` : ""}<span className="block text-xs text-slate-500">{formatDate(p.updatedAt, locale, true)}</span></li>)}</ul>
        )}
        <h3 className="font-medium text-slate-900">{t.calendar.upcomingTeam}</h3>
        {upcoming.length === 0 ? <p className="text-sm text-slate-500">{t.calendar.noMeetings}</p> : (
          <ul className="space-y-1 text-sm">{upcoming.map((x) => <li key={x.id}>{formatDate(x.startsAt, locale, true)} · {x.attendeeName} · {x.staff.displayName ?? x.staff.user.name} · {t.calendar.types[x.type]}</li>)}</ul>
        )}
        <p className="text-xs text-slate-500">{m.reassignHint}</p>
      </section>
    </div>
  );
}
