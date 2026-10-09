import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { CrmError } from "@/lib/sales-crm/prospects";
import { newReplyKey } from "@/domain/sales-comms/tokens";

/** Threads a seller may read: own threads; a manager adds their team's and the unassigned pool; Super Admin everything. */
export function threadScopeWhere(actor: PlatformSalesActor): Prisma.CrmEmailThreadWhereInput {
  if (actor.all) return {};
  const or: Prisma.CrmEmailThreadWhereInput[] = [{ ownerStaffId: { in: [...actor.scopeStaffIds] } }];
  if (actor.kind === "SALES_MANAGER") or.push({ ownerStaffId: null });
  return { OR: or };
}

export async function requireScopedThread(actor: PlatformSalesActor, id: string) {
  const t = await db.crmEmailThread.findFirst({ where: { id, ...threadScopeWhere(actor) } });
  if (!t) throw new CrmError("NOT_FOUND");
  return t;
}

export async function createThread(args: {
  subject: string; identityId: string; ownerStaffId: string | null; prospectId?: string | null; contactId?: string | null; opportunityId?: string | null;
  counterpartyEmail?: string | null; language?: "FR" | "EN" | "UNKNOWN"; createdByUserId?: string | null;
}, client: Prisma.TransactionClient | typeof db = db) {
  return client.crmEmailThread.create({
    data: {
      replyKey: newReplyKey(), subject: args.subject.slice(0, 300), identityId: args.identityId, ownerStaffId: args.ownerStaffId,
      prospectId: args.prospectId ?? null, contactId: args.contactId ?? null, opportunityId: args.opportunityId ?? null,
      counterpartyEmail: args.counterpartyEmail?.toLowerCase() ?? null, language: args.language ?? "UNKNOWN", createdByUserId: args.createdByUserId ?? null,
    },
  });
}

/** RFC 5322 reply headers for the next message of a thread: it references every earlier delivered message. */
export async function threadingFor(threadId: string): Promise<{ references: string[]; inReplyTo: string | null }> {
  const prior = await db.crmEmailMessage.findMany({
    where: { threadId, status: { notIn: ["DRAFT", "CANCELLED", "FAILED"] }, internetMessageId: { not: null } },
    orderBy: { createdAt: "asc" }, select: { internetMessageId: true, altMessageIds: true },
  });
  const refs = prior.flatMap((p) => [p.internetMessageId!, ...p.altMessageIds]).filter(Boolean);
  const last = prior[prior.length - 1];
  return { references: refs.slice(-20), inReplyTo: last?.internetMessageId ?? null };
}
