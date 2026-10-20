// Call-session state machine — pure. Provider callbacks arrive late, duplicated and out of order; a state never moves backwards and a terminal state is final.
export type CallState = "PENDING" | "RINGING" | "IN_PROGRESS" | "COMPLETED" | "BUSY" | "NO_ANSWER" | "FAILED" | "CANCELED" | "ABANDONED";

export const TERMINAL_STATES: ReadonlySet<CallState> = new Set(["COMPLETED", "BUSY", "NO_ANSWER", "FAILED", "CANCELED", "ABANDONED"]);
export const isTerminal = (s: CallState) => TERMINAL_STATES.has(s);
const RANK: Record<CallState, number> = { PENDING: 0, RINGING: 1, IN_PROGRESS: 2, COMPLETED: 3, BUSY: 3, NO_ANSWER: 3, FAILED: 3, CANCELED: 3, ABANDONED: 3 };

/** Twilio CallStatus → our state. Unknown values are ignored (null). */
export function stateFromTwilio(status: string | null | undefined): CallState | null {
  switch ((status ?? "").toLowerCase()) {
    case "queued": case "initiated": return "PENDING";
    case "ringing": return "RINGING";
    case "in-progress": return "IN_PROGRESS";
    case "completed": return "COMPLETED";
    case "busy": return "BUSY";
    case "no-answer": return "NO_ANSWER";
    case "failed": return "FAILED";
    case "canceled": return "CANCELED";
    default: return null;
  }
}

/** The state after applying an event: forward-only, terminal is final. Returns the current state when the event must be ignored. */
export function nextState(current: CallState, incoming: CallState | null): CallState {
  if (!incoming || isTerminal(current)) return current;
  return RANK[incoming] > RANK[current] ? incoming : current;
}
