"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { PERSON_KEY_RE } from "@/lib/sales-crm/person";
import { CrmError } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";

/**
 * Links (or unlinks) a platform account to a person. Super Admin only. Independent CASL review compares people, so this is a compliance control: the change is audited
 * with before/after and never touches authorization, ownership or any evidence/approval row. Only accounts that already belong to the platform team can be linked.
 */
export async function setPersonKey(userId: string, key: string | null) {
  const actor = await requireCrmActor("manage_team");
  return crmAction(async () => {
    if (!actor.all) throw new CrmError("SALES_FORBIDDEN"); // defence in depth: `manage_team` is already Super Admin only; identity links must never be delegated
    const clean = (key ?? "").trim().toLowerCase();
    if (clean && !PERSON_KEY_RE.test(clean)) throw new CrmError("INVALID");
    const u = await db.user.findUnique({ where: { id: String(userId ?? "") }, select: { id: true, role: true, personKey: true, platformSalesStaff: { select: { id: true } } } });
    if (!u || (u.role !== "SUPER_ADMIN" && !u.platformSalesStaff)) throw new CrmError("NOT_FOUND");
    if ((u.personKey ?? "") === clean) return {};
    await db.user.update({ where: { id: u.id }, data: { personKey: clean || null } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "PERSON_LINK_SET", entityType: "User", entityId: u.id, staffId: u.platformSalesStaff?.id ?? null, before: { personKey: u.personKey }, after: { personKey: clean || null } });
    revalidatePath(PLATFORM.salesTeam);
    return {};
  });
}
