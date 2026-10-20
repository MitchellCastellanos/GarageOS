import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { callingWindow, type CallingWindowResult } from "@/domain/sales-crm/phone-eligibility";

// REMOTE calling queue: the seller's OWN assigned prospects that can be telephoned right now or later today. It is a read model; it never places a call.
//  · works for any seller with Remote sales (`place_sales_calls`), i.e. FIELD + REMOTE sellers too — ownership is never moved to use it;
//  · REMOTE only: territoryState NATIONAL (a FIELD-held/LOCAL prospect is never listed, whoever owns it — it belongs to the field workflow);
//  · the actor's territory coverage is honoured exactly like acquisition (a prospect outside the covered territories is not listed);
//  · only phoneEligibility = CALLABLE (internal DNC, legal holds and unverified shops are already excluded) and never doNotContact / archived / merged;
//  · no email is needed: email and CASL are not inputs;
//  · prospects with a call in progress (`openCallProspectIds`, supplied by the call-session store) are left out so two sellers never ring the same shop.
// The dial step must re-evaluate eligibility on live facts; this list is for ordering and display only.

export interface CallingQueueItem {
  id: string; name: string; city: string | null; province: string | null; phone: string | null; phoneE164: string | null; language: "FR" | "EN" | "UNKNOWN";
  lastActivityAt: Date | null; window: CallingWindowResult;
}

export interface CallingQueueOptions { now?: Date; limit?: number; openCallProspectIds?: ReadonlySet<string> }

export async function loadCallingQueue(actor: PlatformSalesActor, opts: CallingQueueOptions = {}): Promise<CallingQueueItem[]> {
  if (!actor.capabilities.has("place_sales_calls")) throw new Error("SALES_FORBIDDEN");
  if (!actor.staffId) return []; // a Super Admin without a seller profile owns nothing to call
  const now = opts.now ?? new Date();
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);
  const where: Prisma.CrmProspectWhereInput = {
    assignedStaffId: actor.staffId, status: "ACTIVE", mergedIntoId: null, doNotContact: false,
    territoryState: "NATIONAL", phoneEligibility: "CALLABLE",
    ...(actor.coverageTerritoryKeys?.length ? { OR: [{ territoryKey: null }, { territoryKey: { in: [...actor.coverageTerritoryKeys] } }] } : {}),
    ...(opts.openCallProspectIds?.size ? { id: { notIn: [...opts.openCallProspectIds] } } : {}),
  };
  const rows = await db.crmProspect.findMany({
    where, orderBy: [{ lastActivityAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: limit * 3,
    select: { id: true, name: true, city: true, province: true, phone: true, phoneE164: true, preferredLanguage: true, lastActivityAt: true },
  });
  const items = rows.map((r): CallingQueueItem => ({
    id: r.id, name: r.name, city: r.city, province: r.province, phone: r.phone, phoneE164: r.phoneE164,
    language: r.preferredLanguage === "UNKNOWN" ? suggestedLanguage(r.province) : r.preferredLanguage, lastActivityAt: r.lastActivityAt, window: callingWindow(r.province, now),
  }));
  // Shops whose calling window is open now come first (stable: least recently touched first within each group).
  return [...items.filter((i) => i.window.open), ...items.filter((i) => !i.window.open)].slice(0, limit);
}

/** Display hint only (never stored, never used for eligibility): Québec → French, everything else English. A known prospect language always wins. */
export function suggestedLanguage(province: string | null): "FR" | "EN" | "UNKNOWN" {
  if (!province) return "UNKNOWN";
  return province.toUpperCase() === "QC" ? "FR" : "EN";
}
