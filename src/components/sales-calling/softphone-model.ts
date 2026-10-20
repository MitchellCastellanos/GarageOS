// Pure logic of the floating softphone (no React, no browser): display-mode preference, lock derivation and label keys.
// Only the preferred DISPLAY MODE is ever persisted — never call or session data.

export const DISPLAY_MODES = ["expanded", "compact", "minimized"] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];
export const DISPLAY_MODE_KEY = "garageos.softphone.displayMode";
export const DEFAULT_MODE: DisplayMode = "expanded";

export type PhonePhase = "idle" | "authorizing" | "dialing" | "ringing" | "connected" | "ended" | "failed";
export const LIVE: readonly PhonePhase[] = ["dialing", "ringing", "connected"];

type ReadStore = { getItem: (k: string) => string | null } | null | undefined;
type WriteStore = { setItem: (k: string, v: string) => void } | null | undefined;

export function parseMode(v: unknown): DisplayMode {
  return typeof v === "string" && (DISPLAY_MODES as readonly string[]).includes(v) ? (v as DisplayMode) : DEFAULT_MODE;
}
/** Reads the stored preference; any storage failure (private mode, blocked, SSR) falls back to the default. */
export function readMode(store: ReadStore): DisplayMode {
  try { return parseMode(store?.getItem(DISPLAY_MODE_KEY) ?? null); } catch { return DEFAULT_MODE; }
}
/** Persists the preference; returns false when storage is unavailable (the in-memory mode still applies). */
export function writeMode(store: WriteStore, mode: DisplayMode): boolean {
  try { if (!store) return false; store.setItem(DISPLAY_MODE_KEY, parseMode(mode)); return true; } catch { return false; }
}

export type CallLockKey = "noProspect" | "pending" | "gate" | "dnc" | "held" | "noPhone";
export type NextLockKey = "blockedLive" | "blockedDispo";

export interface LockInput {
  phase: PhonePhase; hasProspect: boolean; dispoPending: boolean; gateOpen: boolean; doNotContact: boolean; heldProvince: boolean; hasPhone: boolean;
}
export interface Locks {
  callActive: boolean; live: boolean; outcomeDue: boolean;
  callLocked: boolean; callReason: CallLockKey | null;
  nextLocked: boolean; nextReason: NextLockKey | null;
}

/** Same precedence the server enforces: a pending outcome blocks every new call and every Next prospect. Outside hours is NOT a lock (it asks for confirmation). */
export function deriveLocks(i: LockInput): Locks {
  const live = LIVE.includes(i.phase);
  const callActive = live || i.phase === "authorizing";
  const callReason: CallLockKey | null = !i.hasProspect ? "noProspect" : i.dispoPending ? "pending" : !i.gateOpen ? "gate" : i.doNotContact ? "dnc" : i.heldProvince ? "held" : !i.hasPhone ? "noPhone" : null;
  const nextReason: NextLockKey | null = callActive ? "blockedLive" : i.dispoPending ? "blockedDispo" : null;
  return { callActive, live, outcomeDue: i.dispoPending, callLocked: callActive || callReason !== null, callReason, nextLocked: nextReason !== null, nextReason };
}

export type Tone = "idle" | "busy" | "live" | "ended" | "failed";
export function phaseTone(phase: PhonePhase): Tone {
  if (phase === "connected") return "live";
  if (phase === "authorizing" || phase === "dialing" || phase === "ringing") return "busy";
  if (phase === "failed") return "failed";
  if (phase === "ended") return "ended";
  return "idle";
}

/** The mode actually shown: a pending outcome forces the expanded phone once (auto-expand), after which the seller may minimize again. */
export function effectiveMode(preferred: DisplayMode, session: DisplayMode | null): DisplayMode {
  return session ?? preferred;
}

/** Which controls each mode exposes (used by the presentational component and its tests). */
export function controlsFor(mode: DisplayMode, l: Pick<Locks, "live" | "callActive" | "outcomeDue">) {
  return {
    call: mode === "expanded" && !l.callActive,
    hangUp: l.callActive,
    mute: l.live && mode !== "minimized",
    mic: mode === "expanded",
    nav: mode === "expanded",
    outcomeForm: mode === "expanded" && l.outcomeDue,
    outcomeBadge: l.outcomeDue,
  };
}
