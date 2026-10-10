import Link from "next/link";
import { db } from "@/lib/db";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { assignedScopeWhere, can } from "@/domain/sales-crm/access";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { PLATFORM } from "@/lib/routes";
import { Badge, EmptyState, PageHeader, PermissionDenied, cardCls, formatDate } from "@/components/sales-crm/ui";
import { SequenceAdmin } from "@/components/sales-comms/SequenceAdmin";
import { EnrollmentActions } from "@/components/sales-comms/EnrollmentActions";
import { COMMERCIAL_TEMPLATE_KEYS } from "@/domain/sales-comms/templates";
import { getCommsSettings } from "@/lib/sales-comms/settings";

export default async function OutreachPage() {
  const { actor, t: crm, locale } = await loadCrmPage("enroll_sequences");
  if (!actor) return <PermissionDenied t={crm} />;
  const t = commsCopy(locale);
  const admin = can(actor, "manage_sequences");
  const settings = await getCommsSettings();
  const [sequences, enrollments] = await Promise.all([
    db.crmSequence.findMany({ where: admin ? {} : { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, include: { steps: { orderBy: { stepIndex: "asc" } }, _count: { select: { enrollments: { where: { status: { in: ["ACTIVE", "PAUSED"] } } } } } } }),
    db.crmSequenceEnrollment.findMany({
      where: { prospect: assignedScopeWhere(actor) }, orderBy: [{ status: "asc" }, { nextRunAt: "asc" }], take: 100,
      include: { sequence: { select: { name: true, steps: { orderBy: { stepIndex: "asc" } } } }, prospect: { select: { id: true, name: true } }, contact: { select: { name: true } }, staff: { select: { displayName: true, user: { select: { name: true } } } } },
    }),
  ]);
  const tz = actor.staffId ? (await db.platformSalesStaff.findUnique({ where: { id: actor.staffId }, select: { timezone: true } }))?.timezone ?? "America/Toronto" : "America/Toronto";
  const when = (d: Date | null) => (d ? new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(d) : "—");
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={t.outreach.title} subtitle={t.outreach.subtitle} />
      <section className={`${cardCls} text-sm text-slate-700`} aria-labelledby="comp-h">
        <h2 id="comp-h" className="font-semibold text-slate-900">{t.outreach.compliance}</h2>
        <p className="mt-1">{t.outreach.complianceBody}</p>
        <p className="mt-1 text-xs text-slate-500">{t.outreach.perSeller}: {settings.defaultDailyLimit} · {t.outreach.window}: {settings.sendWindowStartHour}:00–{settings.sendWindowEndHour}:00 ({tz})</p>
      </section>

      <section aria-labelledby="seq-h" className="space-y-3">
        <h2 id="seq-h" className="font-semibold text-slate-900">{t.outreach.sequences}</h2>
        {admin ? (
          <SequenceAdmin locale={locale} templateKeys={[...COMMERCIAL_TEMPLATE_KEYS]} sequences={sequences.map((s) => ({ id: s.id, name: s.name, description: s.description, status: s.status, businessDaysOnly: s.businessDaysOnly, steps: s.steps.map((x) => ({ dayOffset: x.dayOffset, templateKey: x.templateKey })), live: s._count.enrollments }))} />
        ) : sequences.length === 0 ? <EmptyState title={t.outreach.noSequences} hint={t.outreach.noSequencesHint} /> : (
          <ul className="space-y-2">{sequences.map((s) => (
            <li key={s.id} className={cardCls}><p className="font-medium">{s.name}</p><ol className="mt-2 flex flex-wrap gap-2 text-sm">{s.steps.map((st) => <li key={st.id} className="rounded-full bg-slate-100 px-3 py-1">{t.outreach.day} {st.dayOffset + 1} · {t.templateNames[st.templateKey]}</li>)}</ol></li>
          ))}</ul>
        )}
      </section>

      <section aria-labelledby="enr-h" className="space-y-3">
        <h2 id="enr-h" className="font-semibold text-slate-900">{t.outreach.enrollments}</h2>
        {enrollments.length === 0 ? <EmptyState title={t.outreach.noEnrollments} /> : (
          <ul className="space-y-2">
            {enrollments.map((e) => {
              const step = e.sequence.steps.find((s) => s.stepIndex === e.nextStepIndex);
              return (
                <li key={e.id} className={cardCls}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 break-words"><Link className="font-medium text-blue-700 hover:underline" href={PLATFORM.salesProspect(e.prospect.id)}>{e.prospect.name}</Link> <span className="text-sm text-slate-500">· {e.contact.name} · {e.sequence.name}</span></p>
                    <Badge tone={e.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : e.status === "PAUSED" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"}>{t.outreach.state[e.status]}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {(e.status === "ACTIVE" || e.status === "PAUSED") && step ? <>{t.outreach.stepOf} {e.nextStepIndex + 1} {t.outreach.of} {e.sequence.steps.length}: {t.templateNames[step.templateKey]} — {t.outreach.nextAt}: {when(e.nextRunAt)}</> : null}
                    {e.status === "COMPLETED" ? `${t.outreach.completed} ${formatDate(e.completedAt, locale, true)}` : null}
                    {(e.status === "STOPPED" || e.status === "PAUSED") && e.stopReason ? ` ${e.status === "STOPPED" ? t.outreach.stoppedBecause : t.outreach.pausedBecause} ${t.outreach.stopReasons[e.stopReason.split(":")[0]] ?? e.stopReason}` : null}
                  </p>
                  <p className="text-xs text-slate-500">{t.outreach.seller}: {e.staff.displayName ?? e.staff.user.name}</p>
                  <div className="mt-2"><EnrollmentActions locale={locale} id={e.id} status={e.status} /></div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
