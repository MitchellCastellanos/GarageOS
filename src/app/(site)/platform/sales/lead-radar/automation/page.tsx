import Link from "next/link";
import type { ReactNode } from "react";
import { formatCad } from "@/domain/lead-radar/budget";
import { PROVINCE_NAMES, type ProvinceCode } from "@/domain/lead-radar/geo";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { budgetOverview } from "@/lib/lead-radar/budget";
import { automationDashboard } from "@/lib/lead-radar/dashboard";
import { leadRadarOverview } from "@/lib/lead-radar/overview";
import { loadRadarPage } from "@/lib/lead-radar/page";
import { Badge, btnSecondary, cardCls, formatDate, PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { AutomationControls } from "@/components/lead-radar/AutomationControls";
import { PolicyPanel } from "@/components/lead-radar/PolicyPanel";
import { PolicyComparePanel } from "@/components/lead-radar/PolicyComparePanel";

export const dynamic = "force-dynamic";
// The manual "Run one cycle now" server action executes under this route's limit.
export const maxDuration = 60;

function Stat({ label, value, tone, href }: { label: string; value: number | string; tone?: string; href?: string }) {
  const body = (<><dt className="text-xs text-slate-500">{label}</dt><dd className={`text-2xl font-semibold tabular-nums ${tone ?? "text-slate-900"}`}>{typeof value === "number" ? value.toLocaleString("en-CA") : value}</dd></>);
  return <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">{href ? <Link href={href} className="block underline-offset-2 hover:underline">{body}</Link> : body}</div>;
}
function Reasons({ title, data, labels }: { title: string; data: Record<string, number>; labels: Record<string, string> }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return null;
  return (<div><h4 className="text-sm font-medium text-slate-700">{title}</h4><ul className="mt-1 text-sm text-slate-700">{rows.map(([k, v]) => <li key={k} className="flex justify-between gap-3 border-t border-slate-100 py-1"><span className="min-w-0">{labels[k] ?? k}</span><span className="tabular-nums">{v.toLocaleString("en-CA")}</span></li>)}</ul></div>);
}
function Stage({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (<section className={`${cardCls} space-y-3`} aria-labelledby={id}><h2 id={id} className="font-semibold text-slate-900">{title}</h2>{children}</section>);
}

export default async function LeadRadarAutomationPage() {
  const { actor, access, locale, t, c } = await loadRadarPage("admin");
  if (!actor || !access?.admin) return <PermissionDenied t={t} />;
  const a = c.automation;
  const [d, overview, budget, sequences] = await Promise.all([
    automationDashboard(actor), leadRadarOverview(actor), budgetOverview(),
    db.crmSequence.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const { pausedAt: _pa, lastTickAt: _lt, ...controls } = d.automation;
  void _pa; void _lt;
  const cand = (q: string) => `${PLATFORM.salesLeadRadarCandidates}?${q}`;
  const m = d.sending.messages;
  const pct = (x: number, y: number) => (y ? Math.round((x / y) * 100) : 0);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title={a.title} subtitle={a.subtitle} actions={<Link className={btnSecondary} href={PLATFORM.salesLeadRadar}>{a.back}</Link>} />

      <p role="status" className={`rounded-lg px-3 py-2 text-sm ${d.automation.enabled ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
        <strong>{d.automation.enabled ? a.status.on : a.status.off}.</strong> {d.policy ? `${a.status.policy}: ${a.status.version} ${d.policy.version}.` : `${a.status.noPolicy}.`} {a.status.lastTick}: {d.automation.lastTickAt ? formatDate(d.automation.lastTickAt, locale, true) : a.status.never}.
        {!d.automation.enabled && d.automation.pausedReason ? ` ${a.status.paused}: ${d.automation.pausedReason}` : ""}
        <span className="block text-xs">{a.status.help}</span>
      </p>

      <Stage id="au-att" title={a.attention.title}>
        {d.issues.length === 0 ? <p className="text-sm text-slate-500">{a.attention.none}</p> : (
          <ul className="space-y-1 text-sm text-amber-900">{d.issues.map((i, k) => <li key={`${i.code}-${k}`} className="rounded bg-amber-50 px-3 py-2">{a.issues[i.code] ?? i.code}{i.count ? ` (${i.count})` : ""}</li>)}</ul>
        )}
      </Stage>

      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{a.notContacted}</p>

      <div className="grid gap-5 lg:grid-cols-2">
        <Stage id="au-1" title={a.stages.acquisition}>
          <dl className="grid grid-cols-2 gap-3">
            <Stat label={a.acquisition.discovered} value={overview.counts.total} />
            <Stat label={a.acquisition.lastRelease} value={overview.lastExtraction?.sourceRelease ?? "—"} />
            <Stat label={a.acquisition.budget} value={`CAD ${formatCad(budget.reservedMicroCad + budget.settledMicroCad)} / ${formatCad(budget.limitMicroCad)}`} />
          </dl>
          <p className="text-xs text-slate-500">{a.acquisition.dataOnly} <Link className="text-blue-700 underline" href={PLATFORM.salesLeadRadar}>{a.acquisition.open}</Link></p>
        </Stage>

        <Stage id="au-2" title={a.stages.qualification}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label={a.qualification.auto} value={d.qualification.auto} tone="text-emerald-700" href={cand("lane=AUTO_ELIGIBLE")} />
            <Stat label={a.qualification.review} value={d.qualification.humanPending} tone="text-amber-700" href={cand("lane=HUMAN_REVIEW&review=PENDING")} />
            <Stat label={a.qualification.blocked} value={d.qualification.blocked} href={cand("lane=BLOCKED")} />
            <Stat label={a.qualification.awaiting} value={d.qualification.awaitingEvaluation} />
            <Stat label={a.qualification.waitingRun} value={d.qualification.awaitingRunCompletion} />
            <Stat label={a.qualification.outOfScope} value={d.qualification.outOfScope} />
          </dl>
          <Link className="text-sm text-blue-700 underline" href={cand("lane=HUMAN_REVIEW&review=PENDING")}>{a.qualification.reviewQueue}</Link>
          <Reasons title={a.qualification.reasonsReview} data={d.qualification.reviewReasons} labels={a.qualification.reasons} />
          <Reasons title={a.qualification.reasonsBlocked} data={d.qualification.blockedReasons} labels={a.qualification.reasons} />
          <Reasons title={a.qualification.reasonsAuto} data={d.qualification.autoReasons} labels={a.qualification.reasons} />
        </Stage>

        <Stage id="au-3" title={a.stages.crm}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label={a.crm.created} value={d.crm.byState.CREATED ?? 0} tone="text-emerald-700" />
            <Stat label={a.crm.linked} value={d.crm.byState.LINKED ?? 0} />
            <Stat label={a.crm.sentToReview} value={d.crm.byState.SENT_TO_REVIEW ?? 0} />
            <Stat label={a.crm.approvedWaiting} value={d.crm.autoPendingImport} />
            <Stat label={a.crm.failed} value={d.crm.byState.FAILED ?? 0} tone={d.crm.byState.FAILED ? "text-red-700" : undefined} href={cand("imp=FAILED")} />
            <Stat label={a.crm.stalled} value={d.crm.stalled} tone={d.crm.stalled ? "text-red-700" : undefined} />
          </dl>
          <Reasons title={a.crm.failedReasons} data={d.crm.failedCodes} labels={{}} />
          {d.crm.batches.length > 0 && <div><h4 className="text-sm font-medium text-slate-700">{a.crm.batches}</h4><ul className="mt-1 text-sm text-slate-700">{d.crm.batches.map((b) => <li key={b.id} className="flex justify-between gap-3 border-t border-slate-100 py-1"><span>{b.at ? formatDate(b.at, locale, true) : "—"} · {b.automatic ? a.crm.automatic : a.crm.manual}</span><span className="tabular-nums">{b.created}</span></li>)}</ul></div>}
        </Stage>

        <Stage id="au-4" title={a.stages.assignment}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={a.assignment.field} value={d.assignment.field} />
            <Stat label={a.assignment.remote} value={d.assignment.remote} />
            <Stat label={a.assignment.untagged} value={d.assignment.untagged} />
            <Stat label={a.assignment.unassigned} value={d.assignment.unassigned} tone={d.assignment.unassigned ? "text-amber-700" : undefined} />
          </dl>
          {d.assignment.lastNote && <p className="text-xs text-amber-800">{a.assignment.notes[d.assignment.lastNote] ?? d.assignment.lastNote}</p>}
          <Reasons title={a.assignment.lastSkips} data={d.assignment.lastSkips} labels={a.assignment.skips} />
        </Stage>

        <Stage id="au-5" title={a.stages.eligibility}>
          <dl className="grid grid-cols-3 gap-3">
            <Stat label={a.eligibility.eligible} value={d.eligibility.eligible} tone="text-emerald-700" />
            <Stat label={a.eligibility.notEligible} value={d.eligibility.notEligible} />
            <Stat label={a.eligibility.awaiting} value={d.eligibility.awaitingAssessment} />
          </dl>
          <h3 className="text-sm font-semibold text-slate-800">{a.readiness.title}</h3>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={a.readiness.READY} value={d.readiness.READY} tone="text-emerald-700" />
            <Stat label={a.readiness.PENDING_REVIEW} value={d.readiness.PENDING_REVIEW} />
            <Stat label={a.readiness.PENDING_EVIDENCE} value={d.readiness.PENDING_EVIDENCE} />
            <Stat label={a.readiness.SUPPRESSED} value={d.readiness.SUPPRESSED} />
            <Stat label={a.readiness.INELIGIBLE} value={d.readiness.INELIGIBLE} />
            <Stat label={a.readiness.readyFr} value={d.readiness.readyByLanguage.FR} />
            <Stat label={a.readiness.readyEn} value={d.readiness.readyByLanguage.EN} />
            <Stat label={a.readiness.unassessed} value={d.readiness.unassessed} />
          </dl>
          <p className="text-xs text-slate-500">{a.readiness.note}</p>
          <Reasons title={a.eligibility.reasons} data={d.eligibility.reasons} labels={a.eligibility.reasonLabels} />
          <p className="text-xs text-slate-500">{a.eligibility.legal}</p>
        </Stage>

        <Stage id="au-6" title={a.stages.sending}>
          <p className={`rounded px-3 py-2 text-xs ${d.sending.sendingEnabled ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>{d.sending.sendingEnabled ? a.sending.sendingOn : a.sending.sendingOff} {a.sending.pilot}: {d.automation.pilotEnabled ? a.status.on : a.status.off}</p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={a.sending.enrolled} value={Object.values(d.sending.enrollments).reduce((x, y) => x + y, 0)} />
            <Stat label={a.sending.queued} value={(m.QUEUED ?? 0) + (m.SCHEDULED ?? 0) + (m.SENDING ?? 0)} />
            <Stat label={a.sending.sent} value={d.sending.prospectsWithMessagesSent} />
            <Stat label={a.sending.delivered} value={m.DELIVERED ?? 0} />
            <Stat label={a.sending.failed} value={(m.FAILED ?? 0) + (m.BOUNCED ?? 0) + (m.COMPLAINED ?? 0)} tone={(m.FAILED ?? 0) + (m.BOUNCED ?? 0) ? "text-red-700" : undefined} />
            <Stat label={a.sending.replied} value={`${d.sending.replied} (${pct(d.sending.replied, d.sending.prospectsWithMessagesSent)}%)`} />
            <Stat label={a.sending.unsubscribed} value={d.sending.unsubscribed} />
            <Stat label={a.sending.meetings} value={d.sending.meetingBooked} />
          </dl>
          <Reasons title={a.sending.pausedReasons} data={d.sending.pausedReasons} labels={{}} />
        </Stage>
      </div>

      <Stage id="au-wl" title={a.assignment.sellers}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-2 pr-3">{a.assignment.seller}</th><th className="pr-3">{a.assignment.mode}</th><th className="pr-3">{a.assignment.accepts}</th><th className="pr-3">{a.assignment.named}</th><th className="pr-3 text-right">{a.assignment.active}</th><th className="pr-3 text-right">{a.assignment.fieldLoad}</th><th className="pr-3 text-right">{a.assignment.remoteLoad}</th><th className="pr-3">{a.assignment.caps}</th><th>{a.assignment.sender}</th></tr></thead>
            <tbody>
              {d.assignment.workload.map((w) => (
                <tr key={w.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3">{w.name}<span className="block text-xs text-slate-500">{w.email}</span></td><td className="pr-3">{w.mode}</td><td className="pr-3">{w.accepts ? a.assignment.yes : a.assignment.no}</td><td className="pr-3">{w.inAllowList ? a.assignment.yes : a.assignment.no}</td>
                  <td className="pr-3 text-right tabular-nums">{w.workload}</td><td className="pr-3 text-right tabular-nums">{w.field}</td><td className="pr-3 text-right tabular-nums">{w.remote}</td>
                  <td className="pr-3 text-xs">{[w.cap ?? "∞", w.fieldCap ?? "∞", w.remoteCap ?? "∞"].join(" / ")}</td>
                  <td>{!w.senderStatus ? <Badge tone="bg-red-100 text-red-800">{a.assignment.noSender}</Badge> : w.senderStatus !== "ACTIVE" ? <Badge tone="bg-amber-100 text-amber-900">{a.assignment.senderNotReady}</Badge> : !w.replyPathVerified ? <Badge tone="bg-amber-100 text-amber-900">{a.assignment.replyUnverified}</Badge> : <Badge tone="bg-emerald-50 text-emerald-800">{a.assignment.senderReady}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Stage>

      <Stage id="au-cov" title={a.coverage.title}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-2 pr-3">{a.coverage.province}</th><th className="pr-3 text-right">{a.coverage.discovered}</th><th className="pr-3 text-right">{a.coverage.imported}</th><th /></tr></thead>
            <tbody>{overview.provinces.map((p) => (
              <tr key={p.province} className="border-t border-slate-100"><td className="py-2 pr-3">{PROVINCE_NAMES[p.province as ProvinceCode][locale]}</td><td className="pr-3 text-right tabular-nums">{p.total}</td><td className="pr-3 text-right tabular-nums">{p.imported}</td><td>{p.gap === "NEVER" && <Badge tone="bg-amber-100 text-amber-900">{a.coverage.never}</Badge>}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Stage>

      <PolicyPanel locale={locale} policies={d.policies.map((p) => ({ ...p, previewedAt: p.previewedAt?.toISOString() ?? null, activatedAt: p.activatedAt?.toISOString() ?? null }))} />
      <PolicyComparePanel locale={locale} policies={d.policies.map((p) => ({ id: p.id, version: p.version, name: p.name, status: p.status }))} />
      <AutomationControls locale={locale} automation={controls} sellers={d.assignment.workload.map((w) => ({ id: w.id, name: w.name, email: w.email, mode: w.mode ?? "REMOTE" }))} sequences={sequences} />

      <Stage id="au-runs" title={a.runs.title}>
        {d.runs.length === 0 ? <p className="text-sm text-slate-500">{a.runs.empty}</p> : (
          <ul className="divide-y divide-slate-100 text-sm">{d.runs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <Badge tone={r.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : r.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}>{a.runs.states[r.status]}</Badge>
              <span>{formatDate(r.startedAt, locale, true)}</span><span className="text-slate-600">{r.trigger}</span>{r.policyVersion ? <span className="text-slate-600">v{r.policyVersion}</span> : null}{r.errorCode ? <span className="text-red-700">{r.errorCode}</span> : null}
            </li>
          ))}</ul>
        )}
      </Stage>
    </div>
  );
}
