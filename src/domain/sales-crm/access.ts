// Platform Sales authorization — pure rules (no DB). Platform authority is NEVER derived from the tenant `Role`:
// it comes from SUPER_ADMIN or from an ACTIVE PlatformSalesStaff row (see src/lib/sales-crm/access.ts).

export type PlatformSalesKind = "SUPER_ADMIN" | "SALES_MANAGER" | "SALES_REP";

export const SALES_CAPABILITIES = [
  "read_assigned_prospects",
  "read_team_prospects",
  "read_all_prospects",
  "manage_prospects",
  "import_prospects",
  "reassign_prospects",
  "prepare_demo",
  "view_team_reporting",
  "view_all_reporting",
  "manage_team",
  "manage_needs_taxonomy",
  // Reserved for Agents 2 and 3. Declared here so every agent shares ONE capability vocabulary; Agent 1 does not
  // implement the features behind them.
  "send_sales_email",
  "manage_sequences",
  "manage_sender_identities",
  "manage_playbooks",
  // Agent 2 (sales communications & scheduling): enrolling own prospects in approved sequences; own calendar/availability/booking.
  "enroll_sequences",
  "manage_calendar",
] as const;
export type SalesCapability = (typeof SALES_CAPABILITIES)[number];

const REP: SalesCapability[] = ["read_assigned_prospects", "manage_prospects", "import_prospects", "prepare_demo", "send_sales_email", "enroll_sequences", "manage_calendar"];
const MANAGER: SalesCapability[] = [...REP, "read_team_prospects", "reassign_prospects", "view_team_reporting"];

export function capabilitiesFor(kind: PlatformSalesKind): ReadonlySet<SalesCapability> {
  if (kind === "SUPER_ADMIN") return new Set(SALES_CAPABILITIES);
  return new Set(kind === "SALES_MANAGER" ? MANAGER : REP);
}

export interface PlatformSalesActor {
  userId: string;
  name: string;
  kind: PlatformSalesKind;
  /** Staff row of the actor (null for a Super Admin without a staff profile). */
  staffId: string | null;
  capabilities: ReadonlySet<SalesCapability>;
  /** Locale of the sales UI for this actor ("en" | "fr"). */
  uiLocale: "en" | "fr";
  /** Staff ids whose records the actor may read (self + direct reports for a manager). Ignored when `all`. */
  scopeStaffIds: readonly string[];
  /** User ids whose SalesDemo records the actor may use (self + reports). Ignored when `all`. */
  scopeUserIds: readonly string[];
  all: boolean;
}

export function can(actor: PlatformSalesActor, capability: SalesCapability): boolean {
  return actor.capabilities.has(capability);
}

/** Unassigned prospects are a shared pool that only managers and Super Admin can see and hand out. */
function includesUnassigned(actor: PlatformSalesActor) {
  return actor.all || actor.kind === "SALES_MANAGER";
}

export function canAccessAssignedStaff(actor: PlatformSalesActor, assignedStaffId: string | null | undefined): boolean {
  if (actor.all) return true;
  if (!assignedStaffId) return includesUnassigned(actor);
  return actor.scopeStaffIds.includes(assignedStaffId);
}

/** Prisma `where` fragment restricting CrmProspect / CrmOpportunity / CrmTask rows to the actor's scope. */
export function assignedScopeWhere(actor: PlatformSalesActor): Record<string, unknown> {
  if (actor.all) return {};
  const or: Record<string, unknown>[] = [{ assignedStaffId: { in: [...actor.scopeStaffIds] } }];
  if (includesUnassigned(actor)) or.push({ assignedStaffId: null });
  return { OR: or };
}

export function canAccessDemoCreator(actor: PlatformSalesActor, createdByUserId: string): boolean {
  return actor.all || actor.scopeUserIds.includes(createdByUserId);
}

/** Who may a record be assigned to? Reps only themselves, managers their team, Super Admin anyone active. */
export function canAssignToStaff(actor: PlatformSalesActor, targetStaffId: string | null): boolean {
  if (targetStaffId === null) return actor.all || actor.kind === "SALES_MANAGER";
  if (actor.all) return true;
  if (actor.kind === "SALES_MANAGER") return actor.scopeStaffIds.includes(targetStaffId);
  return targetStaffId === actor.staffId;
}
