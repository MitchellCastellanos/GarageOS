// Shared contract between the server actions and the softphone UI. Error codes are mapped to EN/FR copy in src/lib/admin-locale/sales-calling.ts.

export const CALL_ERROR_CODES = [
  "VOICE_DISABLED", "VOICE_NOT_PROVISIONED", "COMPLIANCE_DNCL_NOT_CONFIRMED", "COMPLIANCE_LIVE_CALLING_NOT_AUTHORIZED",
  "NOT_ALLOWED", "PROSPECT_NOT_FOUND", "NOT_YOUR_PROSPECT", "PROSPECT_NOT_REMOTE", "OUTSIDE_COVERAGE", "NOT_CALLABLE", "DO_NOT_CONTACT", "PHONE_SUPPRESSED", "PROVINCE_ON_HOLD",
  "OUTSIDE_CALLING_HOURS", "COOLDOWN", "DAILY_CAP_REACHED", "RATE_LIMITED", "SELLER_ALREADY_ON_CALL", "PROSPECT_ALREADY_IN_CALL", "NUMBER_ALREADY_IN_CALL",
  "TEST_NUMBER_NOT_ALLOWED", "SESSION_NOT_FOUND", "SESSION_EXPIRED", "SESSION_NOT_ENDED", "ALREADY_RECORDED", "INVALID_INPUT",
] as const;
export type CallErrorCode = (typeof CALL_ERROR_CODES)[number];

export type StartCallResult =
  | { ok: true; sessionId: string; authToken: string; accessToken: string; identity: string; expiresInSec: number; destinationMasked: string; callerIdMasked: string; kind: "PROSPECT" | "TEST" }
  | { ok: false; code: CallErrorCode; detail?: string };

export const DISPOSITIONS = ["NO_ANSWER", "VOICEMAIL", "GATEKEEPER", "CALL_BACK", "INTERESTED", "NOT_INTERESTED", "WRONG_NUMBER", "NOT_A_REPAIR_SHOP", "DO_NOT_CALL"] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export interface DispositionInput { outcome: Disposition; note?: string; followUpDate?: string; followUpTime?: string }
export type DispositionResult = { ok: true; activityId: string; taskId: string | null } | { ok: false; code: CallErrorCode; detail?: string };

export const maskNumber = (e164: string) => (e164.length >= 6 ? `${e164.slice(0, e164.length - 7)}••• ••${e164.slice(-2)}` : "•••");
