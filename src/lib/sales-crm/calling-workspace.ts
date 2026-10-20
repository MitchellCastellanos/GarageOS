import "server-only";
import { db } from "@/lib/db";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { callingWindow } from "@/domain/sales-crm/phone-eligibility";
import { evaluateSendingBasis } from "@/domain/sales-comms/casl";
import { suggestedLanguage } from "@/lib/sales-crm/calling-queue";
import { loadAutoCaslPolicy } from "@/lib/sales-comms/auto-casl-policy";
import { requireScopedProspect } from "@/lib/sales-crm/prospects";
import { getCommunicationTimeline, getMeetingHistory } from "@/lib/sales-comms/contracts";
import type { WorkspaceProfile } from "@/lib/voice/workspace-types";

const OPEN_STAGES = ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] as const;

/** Google Maps search link built from the business's own address fields. Null when there is no address to search for. */
export function mapsUrlFor(p: { name: string; address: string | null; city: string | null; province: string | null; postalCode: string | null }): string | null {
  const place = [p.address, p.city, p.province, p.postalCode].filter(Boolean).join(", ");
  if (!place) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${place}`)}`;
}

/** Only an http(s) URL is ever linked (the stored value is imported data). */
export function safeWebsite(v: string | null): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try { const u = new URL(withScheme); return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}

/** Everything the left panel shows for one prospect. Scope-checked like every CRM read; nothing is inferred — a missing value stays null. */
export async function loadWorkspaceProfile(actor: PlatformSalesActor, prospectId: string, now = new Date()): Promise<WorkspaceProfile> {
  await requireScopedProspect(actor, prospectId);
  const [p, auto, defs] = await Promise.all([
    db.crmProspect.findUniqueOrThrow({
      where: { id: prospectId },
      include: {
        assignedStaff: { select: { displayName: true, user: { select: { name: true } } } },
        contacts: { where: { archivedAt: null }, orderBy: [{ isDecisionMaker: "desc" }, { isPrimary: "desc" }, { name: "asc" }], include: { sendingBases: true } },
        opportunities: { where: { stage: { in: [...OPEN_STAGES] } }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, stage: true } },
        activities: { orderBy: { occurredAt: "desc" }, take: 15, select: { id: true, type: true, outcome: true, subject: true, body: true, occurredAt: true, metadata: true } },
        tasks: { where: { status: "OPEN" }, orderBy: { dueAt: "asc" }, take: 10, select: { id: true, title: true, type: true, dueAt: true, status: true } },
        needs: { select: { definitionId: true, severity: true, basis: true } },
        callSessions: { where: { kind: "PROSPECT" }, orderBy: { requestedAt: "desc" }, take: 6, select: { id: true, requestedAt: true, state: true, durationSec: true, dispositionCode: true } },
      },
    }),
    loadAutoCaslPolicy(),
    db.crmNeedDefinition.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { weight: "desc" }], select: { id: true, labelEn: true, labelFr: true, category: true, suggestedFeature: true } }),
  ]);
  const [timeline, meetings] = await Promise.all([getCommunicationTimeline(actor, prospectId, 10), getMeetingHistory(actor, prospectId)]);
  const w = callingWindow(p.province, now);
  const discovery = p.activities.find((a) => (a.metadata as { kind?: string } | null)?.kind === "DISCOVERY");
  const dm = discovery?.metadata as { software?: string | null; painPoints?: string[]; objections?: string[] } | undefined;
  return {
    id: p.id, name: p.name, phone: p.phone, address: p.address, city: p.city, province: p.province, postalCode: p.postalCode,
    website: safeWebsite(p.website), mapsUrl: mapsUrlFor(p),
    industry: p.industry, repairFit: p.repairFit, shopSize: p.shopSize, locationCount: p.locationCount,
    language: p.preferredLanguage, languageSuggested: suggestedLanguage(p.province),
    currentSoftware: p.currentSoftware, notes: p.notes, tags: p.tags,
    stage: p.opportunities[0]?.stage ?? null, opportunityId: p.opportunities[0]?.id ?? null, assignedSeller: p.assignedStaff?.displayName ?? p.assignedStaff?.user?.name ?? null, doNotContact: p.doNotContact,
    window: { open: w.open, localTime: w.localTime, zone: w.zone, reason: w.reason },
    contacts: p.contacts.map((c) => ({
      id: c.id, name: c.name, title: c.title, email: c.email, phone: c.phone, isPrimary: c.isPrimary, isDecisionMaker: c.isDecisionMaker,
      language: c.preferredLanguage === "FR" || c.preferredLanguage === "EN" ? c.preferredLanguage : null, doNotContact: c.doNotContact,
      emailStatus: c.email && evaluateSendingBasis(c.sendingBases, now, auto, { topic: null, recipientEmail: c.email }).valid ? "valid" : "none",
    })),
    activities: p.activities.map((a) => ({ id: a.id, type: a.type, outcome: a.outcome, subject: a.subject, body: a.body ? a.body.slice(0, 400) : null, occurredAt: a.occurredAt.toISOString() })),
    tasks: p.tasks.map((t) => ({ id: t.id, title: t.title, type: t.type, dueAt: t.dueAt.toISOString(), status: t.status })),
    emails: timeline.filter((e) => e.kind === "EMAIL_OUT" || e.kind === "EMAIL_IN").map((e) => ({ id: e.id, kind: e.kind, at: e.at, status: e.status ?? null, subject: e.subject ?? null })),
    meetings: meetings.slice(0, 8).map((m) => ({ id: m.id, startsAt: m.startsAt, status: m.status, type: m.type, outcome: m.outcome })),
    calls: p.callSessions.map((c) => ({ id: c.id, requestedAt: c.requestedAt.toISOString(), state: c.state, durationSec: c.durationSec, disposition: c.dispositionCode })),
    needs: p.needs.map((n) => ({ definitionId: n.definitionId, severity: n.severity, basis: n.basis })),
    needDefinitions: defs,
    lastDiscovery: discovery ? { at: discovery.occurredAt.toISOString(), software: dm?.software ?? null, painPoints: dm?.painPoints ?? [], objections: dm?.objections ?? [] } : null,
  };
}
