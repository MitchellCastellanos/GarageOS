// Progresión de estado de CommunicationMessage, compartida entre proveedores
// (Twilio para SMS, Resend para email). Sin esto un webhook reintentado o
// desordenado podría hacer retroceder un mensaje ya entregado.

import type { CommStatus } from "@prisma/client";

const STATUS_RANK: Partial<Record<CommStatus, number>> = {
  DRAFT: 0,
  QUEUED: 1,
  SENDING: 2,
  SENT: 3,
  DELIVERED: 4,
  FAILED: 4,
  BOUNCED: 4,
};

/**
 * Los callbacks de un proveedor pueden llegar repetidos o desordenados ("sent"
 * después de "delivered"). Solo se avanza; un estado terminal (DELIVERED /
 * FAILED / BOUNCED) nunca se sobrescribe.
 */
export function shouldApplyStatusUpdate(current: CommStatus, next: CommStatus): boolean {
  const currentRank = STATUS_RANK[current];
  const nextRank = STATUS_RANK[next];
  if (currentRank === undefined || nextRank === undefined) return false;
  if (currentRank >= 4) return false;
  return nextRank > currentRank;
}
