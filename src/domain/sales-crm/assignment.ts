// Automatic lead distribution — pure (no DB). Decides WHO could take an unassigned, eligible prospect; the server then
// previews and (after explicit confirmation) applies it. Ownership is never taken from anyone: only unassigned,
// active, non-DNC prospects with a resolved territory are considered.
import { evaluateAcquisition, requiredMode, type AcquisitionTiming, type Engagement, type Mode, type TerritoryRule } from "@/domain/sales-crm/territory";

export type AssignmentSkip = "DNC" | "ARCHIVED" | "ALREADY_OWNED" | "UNRESOLVED_TERRITORY" | "NO_ELIGIBLE_SELLER"
  /** Repair fit: clearly not a repair business (never assigned) / ambiguous (held for a person to decide first). */
  | "FIT_EXCLUDED" | "FIT_REVIEW"
  /** Every otherwise-eligible seller is at their total or per-lane cap. Distinct from NO_ELIGIBLE_SELLER so capacity problems are visible. */
  | "CAPACITY_EXHAUSTED"
  /** Sellers are eligible by territory/mode/capacity, but none works in the prospect's language. */
  | "LANGUAGE_MISMATCH";

export interface AssignableProspect {
  id: string;
  status: "ACTIVE" | "ARCHIVED";
  doNotContact: boolean;
  assignedStaffId: string | null;
  territoryState: "LOCAL" | "NATIONAL" | "UNRESOLVED" | null;
  /** Rule that governs the prospect (local rule, or the catch-all); resolved by the caller from current territory rules. */
  rule: TerritoryRule | null;
  engagement: Engagement;
  /** Per-prospect FIELD window start / manual release; absent = never started, not released. */
  timing?: AcquisitionTiming;
  /** Business language. UNKNOWN / absent is compatible with every seller (a human still resolves it before any email). */
  language?: "FR" | "EN" | "UNKNOWN" | null;
  /** Effective repair fit (stored decision, else the live assessment). Absent = no fit gate (legacy callers). Only VERIFIED_REPAIR may be assigned. */
  repairFit?: "VERIFIED_REPAIR" | "HUMAN_REVIEW" | "EXCLUDED";
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
  /** Optional per-lane workload (prospects assigned automatically as FIELD / REMOTE) and caps. Absent = no lane accounting. */
  laneWorkload?: { FIELD: number; REMOTE: number };
  laneCaps?: { FIELD: number | null; REMOTE: number | null };
  /** Languages the seller works in. Empty/absent = any. */
  languages?: readonly string[];
}
export interface AssignmentProposal { prospectId: string; staffId: string | null; skip: AssignmentSkip | null; territoryKey: string | null; requiredMode: Mode | null }

/**
 * Deterministic least-loaded distribution. FIELD_PRIORITY / FIELD_EXCLUSIVE territories go to FIELD sellers while FIELD
 * holds acquisition; once released (or in national REMOTE_DEFAULT territory) FIELD and REMOTE sellers share the work
 * (a FIELD seller may sell remotely). Coverage, the pause switch and the optional lead cap are honoured. Ties break on id.
 */
export function planAssignments(prospects: readonly AssignableProspect[], sellers: readonly AssignableSeller[], now: Date): AssignmentProposal[] {
  const load = new Map(sellers.map((s) => [s.id, s.workload]));
  const laneLoad = new Map<Mode, Map<string, number>>([
    ["FIELD", new Map(sellers.map((s) => [s.id, s.laneWorkload?.FIELD ?? 0]))],
    ["REMOTE", new Map(sellers.map((s) => [s.id, s.laneWorkload?.REMOTE ?? 0]))],
  ]);
  const out: AssignmentProposal[] = [];
  for (const p of prospects) {
    const base = { prospectId: p.id, staffId: null, territoryKey: p.rule?.key ?? null, requiredMode: null as Mode | null };
    if (p.status !== "ACTIVE") { out.push({ ...base, skip: "ARCHIVED" }); continue; }
    if (p.doNotContact) { out.push({ ...base, skip: "DNC" }); continue; }
    if (p.assignedStaffId) { out.push({ ...base, skip: "ALREADY_OWNED" }); continue; }
    if (p.repairFit === "EXCLUDED") { out.push({ ...base, skip: "FIT_EXCLUDED" }); continue; }
    if (p.repairFit === "HUMAN_REVIEW") { out.push({ ...base, skip: "FIT_REVIEW" }); continue; }
    if (p.territoryState !== "LOCAL" && p.territoryState !== "NATIONAL") { out.push({ ...base, skip: "UNRESOLVED_TERRITORY" }); continue; }
    const required = requiredMode(p.rule, p.engagement, now, p.timing);
    // 1) hard compatibility: availability switch, working mode + territory coverage (the existing acquisition rules).
    const compatible = sellers.filter((s) => s.active && s.acceptsAutoAssignment && s.mode !== null
      && evaluateAcquisition({ mode: s.mode, coverageKeys: s.coverageKeys, isSuperAdmin: false }, p.rule, p.engagement, now, false, p.timing).allowed);
    // 2) language: an UNKNOWN business language fits everyone; a known one needs a seller who works in it (empty list = any).
    const lang = p.language === "FR" || p.language === "EN" ? p.language : null;
    const spoken = lang ? compatible.filter((s) => !s.languages?.length || s.languages.includes(lang)) : compatible;
    // 3) capacity: total cap, then the cap of the lane this prospect is acquired under (the plan's own proposals count).
    const lane = laneLoad.get(required);
    const withRoom = spoken.filter((s) => (s.maxActiveLeads === null || (load.get(s.id) ?? 0) < s.maxActiveLeads)
      && (s.laneCaps?.[required] == null || (lane?.get(s.id) ?? 0) < s.laneCaps[required]!));
    if (!withRoom.length) {
      const skip: AssignmentSkip = !compatible.length ? "NO_ELIGIBLE_SELLER" : !spoken.length ? "LANGUAGE_MISMATCH" : "CAPACITY_EXHAUSTED";
      out.push({ ...base, requiredMode: required, skip });
      continue;
    }
    // Fair distribution: least-loaded first (total active workload), ties by id so the plan is deterministic.
    const pick = withRoom.sort((a, b) => (load.get(a.id)! - load.get(b.id)!) || a.id.localeCompare(b.id))[0];
    load.set(pick.id, load.get(pick.id)! + 1);
    lane?.set(pick.id, (lane.get(pick.id) ?? 0) + 1);
    out.push({ ...base, requiredMode: required, staffId: pick.id, skip: null });
  }
  return out;
}
