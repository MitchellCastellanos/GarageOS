import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/domain/sales-crm/access";
import { BOARD_STAGES } from "@/domain/sales-crm/pipeline";
import { staffSummary } from "@/lib/sales-crm/queries";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { PLATFORM } from "@/lib/routes";
import { Badge, PageHeader, PermissionDenied, cardCls, formatDate } from "@/components/sales-crm/ui";
import { StaffForm } from "@/components/sales-crm/StaffForm";
import { StaffActions } from "@/components/sales-crm/StaffActions";
import { getAppUrl } from "@/config/app";
import { signatureLogoUrl } from "@/lib/sales-comms/content";
import { getCommsSettings } from "@/lib/sales-comms/settings";

export default async function StaffDetailPage({ params }: { params: Promise<{ staffId: string }> }) {
  const { actor, t, locale } = await loadCrmPage("view_team_reporting");
  if (!actor) return <PermissionDenied t={t} />;
  const { staffId } = await params;
  const s = await staffSummary(actor, staffId);
  if (!s) notFound();
  const manage = can(actor, "manage_team");
  const m = t.team;
  const { staff } = s;
  const [managers, others] = manage ? await Promise.all([
    db.platformSalesStaff.findMany({ where: { role: "SALES_MANAGER", status: { not: "INACTIVE" }, id: { not: staffId } }, select: { id: true, user: { select: { name: true } } } }),
    db.platformSalesStaff.findMany({ where: { status: "ACTIVE", id: { not: staffId } }, select: { id: true, user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } }),
  ]) : [[], []];
  const [sigIdentity, sigLink, sigSettings] = manage ? await Promise.all([
    db.crmSenderIdentity.findUnique({ where: { staffId }, select: { fromEmail: true } }),
    db.crmBookingLink.findFirst({ where: { staffId, kind: "GENERAL", active: true }, select: { token: true } }),
    getCommsSettings(),
  ]) : [null, null, null];
  const tone = staff.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : staff.status === "INVITED" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700";
  const stat = (label: string, value: React.ReactNode) => <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-0.5 text-2xl font-semibold text-slate-900">{value}</p></div>;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href={PLATFORM.salesTeam} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {m.title}</Link>
      <PageHeader title={staff.user.name} subtitle={staff.user.email} actions={<><Badge>{t.staffRoles[staff.role]}</Badge><Badge tone={tone}>{t.staffStatus[staff.status]}</Badge></>} />
      <section className={cardCls} aria-labelledby="sum-h">
        <h2 id="sum-h" className="mb-3 font-semibold text-slate-900">{m.summary}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stat(m.prospects, s.prospects)}{stat(m.openTasks, s.openTasks)}{stat(t.dashboard.overdue, <span className={s.overdueTasks ? "text-rose-700" : undefined}>{s.overdueTasks}</span>)}{stat(m.activities30, s.activities30)}
        </div>
        <p className="mt-3 text-sm text-slate-600">{m.lastActivity}: {formatDate(s.lastActivityAt, locale, true)} · {m.demosCreated}: {Object.values(s.demos).reduce((a, b) => a + b, 0)}</p>
        <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-900">{m.pipelineByStage}</h3>
        <div className="flex flex-wrap gap-2">{BOARD_STAGES.map((st) => <Badge key={st}>{t.stages[st]}: {s.stageCounts[st] ?? 0}</Badge>)}<Badge tone="bg-emerald-100 text-emerald-800">{t.stages.WON}: {s.stageCounts.WON ?? 0}</Badge><Badge tone="bg-rose-100 text-rose-800">{t.stages.LOST}: {s.stageCounts.LOST ?? 0}</Badge></div>
        <div className="mt-4 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
          <p>{m.manager}: {staff.manager?.user.name ?? m.noManager}</p>
          <p>{m.territoriesLabel}: {staff.territories.join(", ") || t.common.none}</p>
          {staff.role === "SALES_MANAGER" && <p>{m.reports}: {staff.reports.map((r) => r.user.name).join(", ") || m.noReports}</p>}
          {staff.deactivatedAt && <p>{t.staffStatus.INACTIVE}: {formatDate(staff.deactivatedAt, locale)}{staff.deactivationReason ? ` — ${staff.deactivationReason}` : ""}</p>}
        </div>
      </section>

      {manage && (<>
        <section className={cardCls} aria-labelledby="prof-h">
          <h2 id="prof-h" className="mb-3 font-semibold text-slate-900">{t.common.edit}</h2>
          <StaffForm locale={locale} staffId={staff.id} signature={{ senderEmail: sigIdentity?.fromEmail ?? null, websiteUrl: sigSettings?.websiteUrl ?? "https://www.garage-os.ca", bookingEnabled: staff.bookingEnabled, bookingUrl: sigLink ? `${getAppUrl()}/sales/book/${sigLink.token}` : null, logoUrl: signatureLogoUrl() }} managers={managers.map((x) => ({ id: x.id, name: x.user.name }))}
            values={{ name: staff.user.name, email: staff.user.email, role: staff.role, title: staff.title, phone: staff.phone, managerId: staff.managerId, territories: staff.territories, uiLocale: staff.uiLocale, timezone: staff.timezone, displayName: staff.displayName, defaultMeetingMinutes: staff.defaultMeetingMinutes, meetingBufferMinutes: staff.meetingBufferMinutes }} />
        </section>
        <section className={cardCls} aria-labelledby="act-h">
          <h2 id="act-h" className="mb-3 font-semibold text-slate-900">{t.common.actions}</h2>
          <StaffActions locale={locale} staffId={staff.id} status={staff.status} isSelf={staff.userId === actor.userId} others={others.map((x) => ({ id: x.id, name: x.user.name }))} />
        </section>
        <section className={cardCls} aria-labelledby="aud-h">
          <h2 id="aud-h" className="mb-1 font-semibold text-slate-900">{m.audit}</h2>
          <p className="mb-3 text-xs text-slate-500">{m.auditNote}</p>
          {s.audit.length === 0 ? <p className="text-sm text-slate-500">{t.common.none}</p> : (
            <ul className="space-y-1.5 text-sm">{s.audit.map((a) => <li key={a.id} className="flex flex-wrap gap-x-2"><b>{m.auditActions[a.action] ?? a.action}</b><span className="text-slate-500">{a.actorName} · {formatDate(a.createdAt, locale, true)}</span></li>)}</ul>
          )}
        </section>
      </>)}
    </div>
  );
}
