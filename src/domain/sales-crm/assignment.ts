// Automatic lead distribution — pure (no DB). Decides WHO could take an unassigned, eligible prospect; the server then
// previews and (after explicit confirmation) applies it. Ownership is never taken from anyone: only unassigned,
// active, non-DNC prospects with a resolved territory are considered.
import { evaluateAcquisition, requiredMode, type Engagement, type Mode, type TerritoryRule } from "@/domain/sales-crm/territory";

export type AssignmentSkip = "DNC" | "ARCHIVED" | "ALREADY_OWNED" | "UNRESOLVED_TERRITORY" | "NO_ELIGIBLE_SELLER";

export interface AssignableProspect {
  id: string;
  status: "ACTIVE" | "ARCHIVED";
  doNotContact: boolean;
  assignedStaffId: string | null;
  territoryState: "LOCAL" | "NATIONAL" | "UNRESOLVED" | null;
  /** Rule that governs the prospect (local rule, or the catch-all); resolved by the caller from current territory rules. */
  rule: TerritoryRule | null;
  engagement: Engagement;
}
export interface AssignableSeller {
  id: string;
  mode: Mode | null;
  coverageKeys: readonly string[];
  active: boolean;
  acceptsAutoAssignment: boolean;
  maxActiveLeads: number | null;
  /** Current active owned prospects (the caller counts them once; the plan adds its own proposals on top). */
  workload: number;
}
export interface AssignmentProposal { prospectId: string; staffId: string | null; skip: AssignmentSkip | null; territoryKey: string | null; requiredMode: Mode | null }

/**
 * Deterministic least-loaded distribution. FIELD_PRIORITY / FIELD_EXCLUSIVE territories go to FIELD sellers while FIELD
 * holds acquisition; once released (or in national REMOTE_DEFAULT territory) FIELD and REMOTE sellers share the work
 * (a FIELD seller may sell remotely). Coverage, the pause switch and the optional lead cap are honoured. Ties break on id.
 */
export function planAssignments(prospects: readonly AssignableProspect[], sellers: readonly AssignableSeller[], now: Date): AssignmentProposal[] {
  const load = new Map(sellers.map((s) => [s.id, s.workload]));
  const out: AssignmentProposal[] = [];
  for (const p of prospects) {
    const base = { prospectId: p.id, staffId: null, territoryKey: p.rule?.key ?? null, requiredMode: null as Mode | null };
    if (p.status !== "ACTIVE") { out.push({ ...base, skip: "ARCHIVED" }); continue; }
    if (p.doNotContact) { out.push({ ...base, skip: "DNC" }); continue; }
    if (p.assignedStaffId) { out.push({ ...base, skip: "ALREADY_OWNED" }); continue; }
    if (p.territoryState !== "LOCAL" && p.territoryState !== "NATIONAL") { out.push({ ...base, skip: "UNRESOLVED_TERRITORY" }); continue; }
    const required = requiredMode(p.rule, p.engagement, now);
    const eligible = sellers
      .filter((s) => s.active && s.acceptsAutoAssignment && s.mode !== null
        && (s.maxActiveLeads === null || (load.get(s.id) ?? 0) < s.maxActiveLeads)
        && evaluateAcquisition({ mode: s.mode, coverageKeys: s.coverageKeys, isSuperAdmin: false }, p.rule, p.engagement, now).allowed)
      .sort((a, b) => (load.get(a.id)! - load.get(b.id)!) || a.id.localeCompare(b.id));
    if (!eligible.length) { out.push({ ...base, requiredMode: required, skip: "NO_ELIGIBLE_SELLER" }); continue; }
    load.set(eligible[0].id, load.get(eligible[0].id)! + 1);
    out.push({ ...base, requiredMode: required, staffId: eligible[0].id, skip: null });
  }
  return out;
}
