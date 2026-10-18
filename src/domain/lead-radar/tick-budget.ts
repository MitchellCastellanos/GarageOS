// Time budget of one automation tick (pure). Kept out of the server module so it is unit-tested.

export const SHARE = { classify: 0.05, rollout: 0.05, qualify: 0.3, import: 0.3, assign: 0.15, release: 0.05, locate: 0.1, screen: 0.05, evidence: 0.9, eligibility: 0.1, pilot: 0.1 } as const;
export type TickStage = keyof typeof SHARE;

/** Share of the tick kept free for the CASL evidence stage (it runs after qualify / import / assign). */
export const EVIDENCE_RESERVE = 0.4;

/**
 * Deadline of one stage inside a tick. The evidence stage runs last, so every earlier stage ends early enough to leave it a guaranteed slice (EVIDENCE_RESERVE of the budget): otherwise a busy
 * qualify / import / assign consumes the whole budget, evidence is granted no time at all, and it only claims and releases rows. Evidence itself may use everything that is left.
 */
export function stageDeadline(i: { name: TickStage; started: number; budget: number; now: number; evidenceEnabled: boolean }): number {
  const own = i.now + Math.max(2_000, i.budget * SHARE[i.name] * 1.5);
  if (i.name === "evidence") return Math.min(i.started + i.budget, own);
  const reserve = i.evidenceEnabled ? Math.round(i.budget * EVIDENCE_RESERVE) : 0;
  return Math.max(i.now + 1_000, Math.min(i.started + i.budget - reserve, own));
}
