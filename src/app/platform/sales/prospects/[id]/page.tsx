import Link from "next/link";
import { notFound } from "next/navigation";
import { getProspectDetail, listAssignableStaff } from "@/lib/sales-crm/queries";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { can } from "@/domain/sales-crm/access";
import { PLATFORM } from "@/lib/routes";
import { isOpenStage } from "@/domain/sales-crm/pipeline";
import type { PipelineStage } from "@/domain/sales-crm/pipeline";
import { Badge, LanguageBadge, PageHeader, PermissionDenied, ScorePill, StageBadge, btnPrimary, btnSecondary, cardCls, formatDate } from "@/components/sales-crm/ui";
import { ContactsPanel } from "@/components/sales-crm/ContactsPanel";
import { NeedsPanel } from "@/components/sales-crm/NeedsPanel";
import { ActivityComposer } from "@/components/sales-crm/ActivityComposer";
import { TaskForm } from "@/components/sales-crm/TaskForm";
import { TaskActions } from "@/components/sales-crm/TaskActions";
import { StageControl } from "@/components/sales-crm/StageControl";
import { OpportunityDetailsForm, ScoreOverrideForm, StartOpportunityButton } from "@/components/sales-crm/OpportunityPanel";
import { AssignControl, ProspectActions } from "@/components/sales-crm/ProspectActions";
import { ScoreBreakdown } from "@/components/sales-crm/ScoreBreakdown";
import type { CrmCopy } from "@/lib/admin-locale/sales-crm";
import { FieldVisitForm } from "@/components/sales-crm/FieldVisitForm";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import { loadEngagement, territoryOfLocation } from "@/lib/sales-crm/territory";
import { requiredMode } from "@/domain/sales-crm/territory";
import { ProspectCommsPanel } from "@/components/sales-comms/ProspectCommsPanel";
import { VideoEngagement } from "@/components/sales-crm/VideoEngagement";
import { videoSummaryForProspect } from "@/lib/sales-video";
import { VIDEO_CRM_COPY } from "@/lib/admin-locale/sales-video";

type Activity = { id: string; type: string; outcome: string | null; subject: string | null; body: string | null; metadata: unknown; occurredAt: Date; author: { name: string }; contact: { name: string } | null };

function activityTitle(a: Activity, t: CrmCopy): string {
  const meta = (a.metadata ?? {}) as Record<string, unknown>;
  if (a.type === "SYSTEM" || (a.type === "NOTE" && typeof meta.event === "string")) return t.activities.events[String(meta.event)] ?? t.activityTypes[a.type];
  if (a.type === "DEMO") return t.activities.events[String(meta.event)] ?? t.activityTypes.DEMO;
  if (a.type === "STAGE_CHANGE") return `${t.activities.stageChange}: ${t.stages[String(meta.from)] ?? "—"} → ${t.stages[String(meta.to)] ?? "—"}`;
  return t.activityTypes[a.type] ?? a.type;
}

export default async function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, t, locale } = await loadCrmPage("read_assigned_prospects");
  if (!actor) return <PermissionDenied t={t} />;
  const { id } = await params;
  const detail = await getProspectDetail(actor, id);
  if (!detail) notFound();
  const { prospect: p, openOpportunity: open, currentOpportunity: current, scores, definitions, recommendations, language } = detail;
  const staff = await listAssignableStaff(actor);
  const canEdit = can(actor, "manage_prospects") && p.status === "ACTIVE";
  const canReassign = can(actor, "reassign_prospects");
  const d = t.prospects.detail;
  const defById = new Map(definitions.map((x) => [x.id, x]));
  const label = (x: { labelEn: string; labelFr: string }) => (locale === "fr" ? x.labelFr : x.labelEn);
  const describe = (x: { descriptionEn: string | null; descriptionFr: string | null }) => (locale === "fr" ? x.descriptionFr : x.descriptionEn);
  const now = new Date();
  const owner = p.assignedStaff;
  const ic = identityCopy(locale);
  const [territory, engagement] = await Promise.all([territoryOfLocation(p), loadEngagement(p.id)]);
  const heldBy = requiredMode(territory, engagement, now);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href={PLATFORM.salesProspects} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {t.nav.prospects}</Link>
      {p.doNotContact && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{d.doNotContactBanner}</div>}
      {p.status === "ARCHIVED" && <div role="status" className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">{d.archivedBanner}</div>}

      <PageHeader title={p.name} subtitle={[p.city, p.province].filter(Boolean).join(", ") || undefined} actions={
        can(actor, "prepare_demo") && !p.doNotContact && p.status === "ACTIVE" && open
          ? <Link className={btnPrimary} href={`${PLATFORM.salesNew}?opportunity=${open.id}`}>{d.prepareDemo}</Link> : undefined} />

      {territory && (
        <section className="flex flex-wrap items-center gap-2 text-sm" aria-label={ic.territories.title}>
          <Badge tone={heldBy === "FIELD" ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}>{ic.territoryBadge[heldBy]}</Badge>
          <span className="text-slate-600">{locale === "fr" ? territory.nameFr : territory.nameEn}</span>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className={cardCls} aria-labelledby="overview-h">
            <h2 id="overview-h" className="mb-3 font-semibold text-slate-900">{d.overview}</h2>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Item label={t.common.website} value={p.website ? <a className="break-all text-blue-700 hover:underline" href={p.website} target="_blank" rel="noopener noreferrer">{p.website}</a> : null} />
              <Item label={t.common.phone} value={p.phone} /><Item label={t.common.email} value={p.email} />
              <Item label={t.prospects.form.address} value={[p.address, p.city, p.province, p.postalCode].filter(Boolean).join(", ") || null} />
              <Item label={t.prospects.form.industry} value={p.industry ? t.industries[p.industry] : null} />
              <Item label={t.prospects.form.shopSize} value={p.shopSize ? t.shopSizes[p.shopSize] : null} />
              <Item label={t.prospects.form.locations} value={String(p.locationCount)} /><Item label={t.prospects.form.software} value={p.currentSoftware} />
              <Item label={d.source} value={`${t.sources[p.source]}${p.sourceDetail ? ` · ${p.sourceDetail}` : ""}`} />
              <Item label={d.effectiveLanguage} value={<span className="inline-flex flex-wrap items-center gap-1.5"><LanguageBadge language={language.language} t={t} />{language.language === "UNKNOWN" ? <span className="text-amber-700">{d.needsDecision}</span> : <span className="text-slate-500">({t.languageSource[language.source]})</span>}</span>} />
              <Item label={d.assignedTo} value={owner ? <>{owner.user.name}{owner.status === "INACTIVE" && <span className="text-amber-700"> ({d.ownerInactive})</span>}</> : t.common.unassigned} />
              {p.tags.length > 0 && <Item label="Tags" value={<span className="flex flex-wrap gap-1">{p.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</span>} />}
              {p.notes && <div className="sm:col-span-2"><dt className="text-slate-500">{t.common.notes}</dt><dd className="mt-0.5 whitespace-pre-wrap break-words text-slate-800">{p.notes}</dd></div>}
            </dl>
            {canReassign && p.status === "ACTIVE" && <div className="mt-4 border-t border-slate-100 pt-4"><AssignControl locale={locale} prospectId={p.id} staff={staff} currentId={p.assignedStaffId} /></div>}
            {can(actor, "manage_prospects") && <div className="mt-4 border-t border-slate-100 pt-4"><ProspectActions locale={locale} prospectId={p.id} archived={p.status === "ARCHIVED"} doNotContact={p.doNotContact} isSuperAdmin={actor.kind === "SUPER_ADMIN"} /></div>}
          </section>

          <section className={cardCls} aria-labelledby="contacts-h">
            <h2 id="contacts-h" className="mb-3 font-semibold text-slate-900">{d.contacts}</h2>
            <ContactsPanel locale={locale} prospectId={p.id} prospectLanguage={p.preferredLanguage} canEdit={canEdit}
              contacts={p.contacts.map((c) => ({ id: c.id, name: c.name, title: c.title, email: c.email, phone: c.phone, isPrimary: c.isPrimary, isDecisionMaker: c.isDecisionMaker, preferredLanguage: c.preferredLanguage, doNotContact: c.doNotContact }))} />
          </section>

          {can(actor, "send_sales_email") && p.status === "ACTIVE" && <ProspectCommsPanel actor={actor} prospectId={p.id} locale={locale} language={p.preferredLanguage} />}

          <VideoEngagement locale={locale} rows={await videoSummaryForProspect(p.id)} className={cardCls} />

          <section className={cardCls} aria-labelledby="needs-h">
            <h2 id="needs-h" className="mb-3 font-semibold text-slate-900">{d.needs}</h2>
            <NeedsPanel locale={locale} prospectId={p.id} canEdit={canEdit}
              definitions={definitions.map((x) => ({ id: x.id, key: x.key, label: label(x), description: describe(x), category: x.category }))}
              assessed={p.needs.filter((n) => defById.has(n.definitionId)).map((n) => ({ definitionId: n.definitionId, severity: n.severity, priority: n.priority, basis: n.basis, evidence: n.evidence, notes: n.notes, assessedAt: n.assessedAt.toISOString() }))} />
          </section>

          <section className={cardCls} aria-labelledby="timeline-h">
            <h2 id="timeline-h" className="mb-3 font-semibold text-slate-900">{d.timeline}</h2>
            {canEdit && can(actor, "log_field_visits") && <details className="mb-5 border-b border-slate-100 pb-5"><summary className="min-h-11 cursor-pointer text-sm font-medium text-blue-700">{ic.visit.log}</summary><div className="mt-2"><FieldVisitForm locale={locale} prospectId={p.id} /></div></details>}
            {canEdit && <div className="mb-5 border-b border-slate-100 pb-5"><ActivityComposer locale={locale} prospectId={p.id} contacts={p.contacts.map((c) => ({ id: c.id, name: c.name }))} /></div>}
            {p.activities.length === 0 ? <p className="text-sm text-slate-500">{t.states.emptyTimeline}</p> : (
              <ol className="space-y-4">
                {p.activities.map((a) => {
                  const meta = (a.metadata ?? {}) as Record<string, unknown>;
                  return (
                    <li key={a.id} className="border-l-2 border-slate-200 pl-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="font-medium text-slate-900">{activityTitle(a, t)}</span>
                        {a.outcome && <Badge>{t.outcomes[a.outcome]}</Badge>}
                        {a.contact && <span className="text-slate-500">· {a.contact.name}</span>}
                      </div>
                      {a.subject && <p className="break-words text-sm text-slate-800">{a.subject}</p>}
                      {a.type === "STAGE_CHANGE" && !!meta.lossReason && <p className="text-sm text-slate-600">{t.lossReasons[String(meta.lossReason)]}</p>}
                      {a.type === "ASSIGNMENT" && <p className="text-sm text-slate-600">{t.activities.assignment}</p>}
                      {typeof meta.event === "string" && meta.event.startsWith("video_") && (
                        <p className="text-sm text-slate-600">{VIDEO_CRM_COPY[locale].languages[meta.language === "FR" ? "FR" : "EN"]} · {VIDEO_CRM_COPY[locale].kinds[meta.videoKey === "teaser" ? "teaser" : "commercial"]}{meta.afterWatching ? ` · ${VIDEO_CRM_COPY[locale].afterWatching}` : ""}</p>
                      )}
                      {a.body && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-700">{a.body}</p>}
                      <p className="mt-0.5 text-xs text-slate-500">{formatDate(a.occurredAt, locale, true)} · {t.activities.by} {a.author.name}</p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className={cardCls} aria-labelledby="opp-h">
            <h2 id="opp-h" className="mb-3 font-semibold text-slate-900">{d.opportunity}</h2>
            {!current ? <p className="text-sm text-slate-500">{d.noOpportunity}</p> : (<div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2"><StageBadge stage={current.stage} t={t} />{current.lossReason && <Badge>{t.lossReasons[current.lossReason]}</Badge>}</div>
              {current.stage === "WON" || !isOpenStage(current.stage as PipelineStage) ? (
                <p className="text-sm text-slate-600">{current.closeNote}</p>
              ) : canEdit && <StageControl locale={locale} opportunityId={current.id} stage={current.stage} />}
              <p className="text-xs text-slate-500">{t.opp.wonNote}</p>
              {open && <OpportunityDetailsForm locale={locale} opportunityId={open.id} disabled={!canEdit}
                values={{ urgency: open.urgency, estimatedPlan: open.estimatedPlan, estimatedMrrCents: open.estimatedMrrCents, expectedCloseDate: open.expectedCloseDate ? open.expectedCloseDate.toISOString().slice(0, 10) : null }} />}
              {!open && canEdit && !p.doNotContact && <StartOpportunityButton locale={locale} prospectId={p.id} />}
              {current.stageEvents.length > 0 && (
                <details className="text-sm"><summary className="min-h-11 cursor-pointer py-2 font-medium text-slate-700">{t.opp.history}</summary>
                  <ul className="space-y-1.5">{current.stageEvents.map((e) => (
                    <li key={e.id} className="text-slate-600">{e.fromStage ? `${t.stages[e.fromStage]} → ` : ""}<b>{t.stages[e.toStage]}</b> <span className="text-xs text-slate-400">· {formatDate(e.createdAt, locale, true)}</span></li>
                  ))}</ul>
                </details>
              )}
            </div>)}
          </section>

          {scores && current && (
            <section className={cardCls} aria-labelledby="score-h">
              <h2 id="score-h" className="mb-3 font-semibold text-slate-900">{d.scoring}</h2>
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{t.scoring.fit}</span><ScorePill value={scores.fit.value} overridden={scores.fit.overridden} label="" t={t} /></div>
                  <p className="mt-1 text-xs text-slate-500">{t.scoring.fitHelp}</p>
                  {scores.fit.overridden && <p className="mt-1 text-xs text-slate-600">{t.scoring.computed}: {current.fitScore ?? "—"} · {current.fitOverrideReason}</p>}
                  <ScoreBreakdown locale={locale} breakdown={current.fitBreakdown} />
                  {open && canEdit && <ScoreOverrideForm locale={locale} opportunityId={open.id} kind="fit" current={current.fitScoreOverride} />}
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{t.scoring.intent}</span><ScorePill value={scores.intent.value} overridden={scores.intent.overridden} label="" t={t} /></div>
                  <p className="mt-1 text-xs text-slate-500">{t.scoring.intentHelp}</p>
                  {scores.intent.overridden && <p className="mt-1 text-xs text-slate-600">{t.scoring.computed}: {current.intentScore ?? "—"} · {current.intentOverrideReason}</p>}
                  <ScoreBreakdown locale={locale} breakdown={current.intentBreakdown} />
                  {open && canEdit && <ScoreOverrideForm locale={locale} opportunityId={open.id} kind="intent" current={current.intentScoreOverride} />}
                </div>
              </div>
            </section>
          )}

          <section className={cardCls} aria-labelledby="rec-h">
            <h2 id="rec-h" className="mb-1 font-semibold text-slate-900">{d.recommended}</h2>
            <p className="mb-3 text-xs text-slate-500">{d.recommendedHint}</p>
            {recommendations.length === 0 ? <p className="text-sm text-slate-500">{d.noRecommended}</p> : (
              <ol className="space-y-1.5 text-sm">{recommendations.map((r, i) => (
                <li key={r.needKey} className="flex items-center justify-between gap-2"><span>{i + 1}. {t.features[r.feature] ?? r.feature}</span><Badge tone={r.basis === "CONFIRMED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-50 text-amber-800"}>{t.bases[r.basis]}</Badge></li>
              ))}</ol>
            )}
          </section>

          <section className={cardCls} aria-labelledby="tasks-h">
            <h2 id="tasks-h" className="mb-3 font-semibold text-slate-900">{d.tasks}</h2>
            {p.tasks.length === 0 ? <p className="mb-3 text-sm text-slate-500">{t.states.emptyTasks}</p> : (
              <ul className="mb-4 space-y-2">{p.tasks.map((task) => {
                const overdue = task.status === "OPEN" && task.dueAt < now;
                return (
                  <li key={task.id} className={`rounded-lg border p-2.5 text-sm ${overdue ? "border-rose-300 bg-rose-50" : "border-slate-200"}`}>
                    <p className={`break-words font-medium ${task.status !== "OPEN" ? "text-slate-400 line-through" : "text-slate-900"}`}>{task.title}</p>
                    <p className="text-xs text-slate-500">{t.taskTypes[task.type]} · {formatDate(task.dueAt, locale, true)}{task.assignedStaff && ` · ${task.assignedStaff.user.name}`}</p>
                    {overdue && <Badge tone="bg-rose-100 text-rose-800">{t.tasks.overdue}</Badge>}
                    {canEdit && <div className="mt-2"><TaskActions locale={locale} taskId={task.id} status={task.status} /></div>}
                  </li>
                );
              })}</ul>
            )}
            {canEdit && <TaskForm locale={locale} prospectId={p.id} staff={staff} defaultStaffId={p.assignedStaffId ?? actor.staffId} canPickAssignee={staff.length > 1} />}
          </section>

          {p.opportunities.some((o) => o.demos.length > 0) && (
            <section className={cardCls} aria-labelledby="demos-h">
              <h2 id="demos-h" className="mb-3 font-semibold text-slate-900">{d.demoLinked}</h2>
              <ul className="space-y-2 text-sm">{p.opportunities.flatMap((o) => o.demos).map((demo) => (
                <li key={demo.id} className="flex items-center justify-between gap-2"><span className="break-words">{demo.shop.name} <Badge>{t.demoStatus[demo.status] ?? demo.status}</Badge></span>
                  <Link className={btnSecondary} href={PLATFORM.salesDemo(demo.id)}>{d.openDemo}</Link></li>
              ))}</ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="mt-0.5 break-words text-slate-800">{value || "—"}</dd></div>;
}
