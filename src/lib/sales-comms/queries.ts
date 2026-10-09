import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assignedScopeWhere, type PlatformSalesActor } from "@/domain/sales-crm/access";
import { threadScopeWhere } from "@/lib/sales-comms/threads";
import { meetingScope } from "@/lib/sales-comms/meetings";

export type InboxView = "all" | "unread" | "needsReply" | "mine" | "drafts" | "done";
export const INBOX_VIEWS: InboxView[] = ["all", "unread", "needsReply", "mine", "drafts", "done"];
export const PAGE_SIZE = 25;

/** Inbox rows. Always intersected with the actor's scope; a thread with nothing but drafts shows only in "drafts". */
export async function listThreads(actor: PlatformSalesActor, o: { view: InboxView; q: string; page: number }) {
  const and: Prisma.CrmEmailThreadWhereInput[] = [threadScopeWhere(actor)];
  if (o.view === "drafts") and.push({ messages: { some: { status: "DRAFT", authorUserId: actor.userId } } });
  else and.push({ messages: { some: { status: { not: "DRAFT" } } } });
  if (o.view === "unread") and.push({ lastInboundAt: { not: null }, ownerSeenAt: null, ownerStaffId: actor.staffId ?? "none" });
  if (o.view === "needsReply") and.push({ needsReply: true, status: "OPEN" });
  if (o.view === "mine") and.push({ ownerStaffId: actor.staffId ?? "none" });
  if (o.view === "done") and.push({ status: { in: ["DONE", "SPAM"] } });
  else if (o.view !== "drafts") and.push({ status: { not: "SPAM" } });
  const q = o.q.trim().slice(0, 80);
  if (q) and.push({ OR: [{ subject: { contains: q, mode: "insensitive" } }, { counterpartyEmail: { contains: q, mode: "insensitive" } }, { prospect: { name: { contains: q, mode: "insensitive" } } }, { contact: { name: { contains: q, mode: "insensitive" } } }] });
  const where: Prisma.CrmEmailThreadWhereInput = { AND: and };
  const [total, rows] = await Promise.all([
    db.crmEmailThread.count({ where }),
    db.crmEmailThread.findMany({
      where, orderBy: { lastMessageAt: "desc" }, skip: (Math.max(o.page, 1) - 1) * PAGE_SIZE, take: PAGE_SIZE,
      include: {
        prospect: { select: { id: true, name: true } }, contact: { select: { id: true, name: true } },
        owner: { select: { id: true, displayName: true, user: { select: { name: true } } } },
        messages: { where: { status: { not: "DRAFT" } }, orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, status: true, bodyText: true, isAutomated: true, fromName: true, fromAddress: true } },
      },
    }),
  ]);
  return { total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), rows };
}

export async function unreadCount(actor: PlatformSalesActor): Promise<number> {
  if (!actor.staffId) return 0;
  return db.crmEmailThread.count({ where: { ownerStaffId: actor.staffId, lastInboundAt: { not: null }, ownerSeenAt: null, status: "OPEN" } });
}

export async function getThreadDetail(actor: PlatformSalesActor, id: string) {
  const thread = await db.crmEmailThread.findFirst({
    where: { id, ...threadScopeWhere(actor) },
    include: {
      prospect: { select: { id: true, name: true, preferredLanguage: true, doNotContact: true } }, contact: { select: { id: true, name: true, email: true } },
      owner: { select: { id: true, displayName: true, user: { select: { name: true } } } },
      identity: { select: { fromName: true, fromEmail: true } },
      messages: { where: { OR: [{ status: { not: "DRAFT" } }, { authorUserId: actor.userId }] }, orderBy: { createdAt: "asc" }, include: { attachments: { select: { id: true, filename: true, sizeBytes: true, mimeType: true } } } },
      notes: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!thread) return null;
  const authors = await db.user.findMany({ where: { id: { in: [...new Set([...thread.notes.map((n) => n.authorUserId), ...thread.messages.map((m) => m.authorUserId).filter((x): x is string => !!x)])] } }, select: { id: true, name: true } });
  return { thread, authors: new Map(authors.map((a) => [a.id, a.name])) };
}

export async function composeProspects(actor: PlatformSalesActor) {
  const rows = await db.crmProspect.findMany({
    where: { ...assignedScopeWhere(actor), status: "ACTIVE", doNotContact: false, contacts: { some: { archivedAt: null, emailNormalized: { not: null } } } },
    orderBy: { updatedAt: "desc" }, take: 300,
    select: { id: true, name: true, preferredLanguage: true, contacts: { where: { archivedAt: null, emailNormalized: { not: null } }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }], select: { id: true, name: true, email: true, preferredLanguage: true, doNotContact: true, sendingBases: { orderBy: { recordedAt: "desc" }, take: 1 } } } },
  });
  return rows;
}

export async function meetingsBetween(actor: PlatformSalesActor, from: Date, to: Date, staffId?: string | null) {
  const scope = meetingScope(actor);
  return db.crmMeeting.findMany({
    where: { AND: [scope, { startsAt: { gte: from, lt: to } }, ...(staffId ? [{ staffId }] : [])] },
    orderBy: { startsAt: "asc" }, take: 500,
    include: { staff: { select: { id: true, displayName: true, user: { select: { name: true } } } } },
  });
}

export async function prospectComms(actor: PlatformSalesActor, prospectId: string) {
  const [threads, meetings, enrollments, sequences] = await Promise.all([
    db.crmEmailThread.findMany({ where: { prospectId, ...threadScopeWhere(actor), messages: { some: { status: { not: "DRAFT" } } } }, orderBy: { lastMessageAt: "desc" }, take: 8, select: { id: true, subject: true, lastMessageAt: true, needsReply: true } }),
    db.crmMeeting.findMany({ where: { prospectId, ...meetingScope(actor) }, orderBy: { startsAt: "desc" }, take: 6, select: { id: true, startsAt: true, status: true, type: true, outcome: true } }),
    db.crmSequenceEnrollment.findMany({ where: { prospectId }, orderBy: { createdAt: "desc" }, take: 6, include: { sequence: { select: { name: true } }, contact: { select: { name: true } } } }),
    db.crmSequence.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
  ]);
  return { threads, meetings, enrollments, sequences };
}
