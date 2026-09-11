import type { WorkOrderStatus } from "@prisma/client";

const transitions: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  OPEN: ["AWAITING_APPROVAL", "CANCELLED"],
  AWAITING_APPROVAL: ["APPROVED", "CANCELLED"],
  APPROVED: ["IN_PROGRESS", "AWAITING_APPROVAL", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "AWAITING_APPROVAL", "CANCELLED"],
  COMPLETED: ["INVOICED"],
  INVOICED: [],
  CANCELLED: [],
};

/** Pure lifecycle rule. Persistence must also verify approval and tenant ownership. */
export function canTransitionWorkOrder(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return transitions[from].includes(to);
}
