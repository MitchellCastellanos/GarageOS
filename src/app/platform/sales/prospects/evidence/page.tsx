import Link from "next/link";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { listPendingEvidence } from "@/lib/sales-crm/review-queries";
import { leadCopy } from "@/lib/admin-locale/sales-lead-engine";
import { PLATFORM } from "@/lib/routes";
import { EmptyState, PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { EvidenceReviewList } from "@/components/sales-crm/EvidenceReviewList";

export default async function EvidencePage() {
  const { actor, t, locale } = await loadCrmPage("approve_casl_evidence");
  if (!actor) return <PermissionDenied t={t} />;
  const L = leadCopy(locale);
  const rows = await listPendingEvidence(actor);
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href={PLATFORM.salesProspects} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {t.common.back}</Link>
      <PageHeader title={L.evidence.title} subtitle={`${rows.length}`} />
      <p className="text-sm text-slate-600">{L.evidence.help}</p>
      {rows.length === 0 ? <EmptyState title={L.evidence.empty} /> : (
        <EvidenceReviewList locale={locale} rows={rows.map((r) => ({
          id: r.id, kind: r.kind, evidence: r.evidence, evidenceType: r.evidenceType, sourceUrl: r.sourceUrl, capturedAt: r.capturedAt?.toISOString() ?? null, supportingFacts: r.supportingFacts, roleRelevance: r.roleRelevance,
          publishedConditionsConfirmed: r.publishedConditionsConfirmed, recordedAt: r.recordedAt.toISOString(), recordedBy: r.recordedBy, contact: { name: r.contact.name, email: r.contact.email }, prospect: { id: r.prospect.id, name: r.prospect.name },
          canApprove: r.canApprove, blocked: r.blocked, history: r.history.map((h) => ({ action: h.action, at: h.at.toISOString() })),
        }))} />
      )}
    </div>
  );
}
