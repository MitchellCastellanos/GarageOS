import "server-only";
import type { Prisma } from "@prisma/client";
import { LEAD_RADAR_SOURCE_KEY } from "@/domain/lead-radar/bridge";

// Work lanes. Ownership (`assignedStaffId`) and attribution are preserved exactly as they are; this module only decides what counts as ACTIONABLE seller work.
//   · FIELD work      — local territory: visits, routes, map, follow-ups. A prospect is never FIELD work when its territory is NATIONAL.
//   · REMOTE cold lane — a national prospect imported by Lead Radar with no human conversation yet. It belongs to the campaign (automation), not to a seller's day.
//   · REMOTE human case — the same prospect once a person is involved: an engaged opportunity, an open task, or an open conversation with a human reply.
// Every fragment is written positively (no NOT over nullable columns): SQL three-valued logic would otherwise silently drop rows whose territory has not been computed yet.

/** Stages that mean a person worked the deal (NEW is the untouched automation state). */
export const HUMAN_STAGES = ["CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] as const;

/** Territory is local or not (yet) classified: a candidate for FIELD work. NATIONAL (outside every local territory) never is. */
export const fieldTerritoryWhere: Prisma.CrmProspectWhereInput = { OR: [{ territoryState: null }, { territoryState: { not: "NATIONAL" } }] };

/** A person is involved in this prospect: engaged deal, open task, or an open conversation that contains a human (non-automated) inbound message. */
export const humanCaseWhere: Prisma.CrmProspectWhereInput = {
  OR: [
    { opportunities: { some: { stage: { in: [...HUMAN_STAGES] } } } },
    { tasks: { some: { status: "OPEN" } } },
    { emailThreads: { some: { status: "OPEN", messages: { some: { direction: "INBOUND", isAutomated: false } } } } },
  ],
};

/** Not part of the cold automated REMOTE lane: local/unclassified, hand-entered or other-source records. (Negation of "national + Lead Radar", written without NOT.) */
const outsideColdLaneWhere: Prisma.CrmProspectWhereInput = {
  OR: [{ territoryState: null }, { territoryState: { not: "NATIONAL" } }, { importBatchId: null }, { importBatch: { is: { sourceKey: { not: LEAD_RADAR_SOURCE_KEY } } } }],
};

/** What a seller may treat as actionable: everything except cold automated REMOTE prospects, which become actionable only through a human case. */
export const actionableProspectWhere: Prisma.CrmProspectWhereInput = { OR: [outsideColdLaneWhere, humanCaseWhere] };

/** Cold automated REMOTE lane: national, imported by Lead Radar, no human involved. Managers see it as the "Automated REMOTE" view; sellers never get it as work. */
export const coldAutomationLaneWhere: Prisma.CrmProspectWhereInput = {
  territoryState: "NATIONAL", importBatch: { is: { sourceKey: LEAD_RADAR_SOURCE_KEY } },
  opportunities: { none: { stage: { in: [...HUMAN_STAGES] } } }, tasks: { none: { status: "OPEN" } },
  emailThreads: { none: { status: "OPEN", messages: { some: { direction: "INBOUND", isAutomated: false } } } },
};

/**
 * A thread that only automation has touched: no human inbound message and no outbound that a person (or a meeting) produced. Hidden from seller inbox views so a
 * running campaign never floods them; a human reply, a manual message or a meeting email makes the thread a normal conversation again.
 */
export const automationOnlyThreadWhere: Prisma.CrmEmailThreadWhereInput = {
  messages: { some: { sequenceEnrollmentId: { not: null } }, none: { OR: [{ direction: "INBOUND", isAutomated: false }, { direction: "OUTBOUND", sequenceEnrollmentId: null }] } },
};
/** Complement of the above, expressed positively (a thread with no sequence message, or with any human involvement). */
export const humanThreadWhere: Prisma.CrmEmailThreadWhereInput = {
  OR: [{ messages: { none: { sequenceEnrollmentId: { not: null } } } }, { messages: { some: { OR: [{ direction: "INBOUND", isAutomated: false }, { direction: "OUTBOUND", sequenceEnrollmentId: null }] } } }],
};
