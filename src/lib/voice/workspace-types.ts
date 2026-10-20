// Client-safe contracts of the Sales Calling Workspace (shared by server actions and the UI). Plain serialisable data only.

export const EMAIL_SCOPES = ["REQUESTED_DEMO", "REQUESTED_BOOKING", "REQUESTED_INFO", "NONE"] as const;
export type EmailScope = (typeof EMAIL_SCOPES)[number];

export const OBJECTION_CODES = ["HAPPY_WITH_CURRENT", "NO_TIME", "TOO_EXPENSIVE", "SEND_INFO_ONLY", "NOT_DECISION_MAKER", "SEASONAL_BUSY", "OTHER"] as const;
export type ObjectionCode = (typeof OBJECTION_CODES)[number];

export interface WorkspaceContact {
  id: string; name: string; title: string | null; email: string | null; phone: string | null; isPrimary: boolean; isDecisionMaker: boolean;
  language: "FR" | "EN" | null; doNotContact: boolean;
  /** CASL: is there a currently valid basis for a commercial email to this contact (null email ⇒ "none"). */
  emailStatus: "valid" | "none";
}

export interface WorkspaceProfile {
  id: string; name: string;
  phone: string | null; address: string | null; city: string | null; province: string | null; postalCode: string | null;
  website: string | null; mapsUrl: string | null;
  industry: string | null; repairFit: "VERIFIED_REPAIR" | "HUMAN_REVIEW" | "EXCLUDED" | null; shopSize: string | null; locationCount: number;
  language: "FR" | "EN" | "UNKNOWN"; languageSuggested: "FR" | "EN" | "UNKNOWN";
  currentSoftware: string | null; notes: string | null; tags: string[];
  stage: string | null; opportunityId: string | null; assignedSeller: string | null; doNotContact: boolean;
  window: { open: boolean; localTime: string; zone: string | null; reason: string };
  contacts: WorkspaceContact[];
  activities: { id: string; type: string; outcome: string | null; subject: string | null; body: string | null; occurredAt: string }[];
  tasks: { id: string; title: string; type: string; dueAt: string; status: string }[];
  emails: { id: string; kind: string; at: string; status: string | null; subject: string | null }[];
  meetings: { id: string; startsAt: string; status: string; type: string; outcome: string | null }[];
  calls: { id: string; requestedAt: string; state: string; durationSec: number | null; disposition: string | null }[];
  needs: { definitionId: string; severity: string; basis: string }[];
  needDefinitions: { id: string; labelEn: string; labelFr: string; category: string | null; suggestedFeature: string }[];
  lastDiscovery: { at: string; software: string | null; painPoints: string[]; objections: string[] } | null;
}

export type NextProspectResponse =
  | { ok: true; found: true; profile: WorkspaceProfile; source: "CALLBACK" | "RANDOM"; province: string | null; provincePool: number; outsideHours: boolean }
  | { ok: true; found: false; reason: "NO_ELIGIBLE" | "ALL_CLOSED" | "NO_SELLER_PROFILE"; nextWindow: { province: string; opensAt: string } | null }
  | { ok: false; code: string };

export interface EmailComposeContext {
  prospect: { id: string; name: string; language: "FR" | "EN" | "UNKNOWN"; contacts: { id: string; name: string; email: string | null; language: "FR" | "EN" | null; basis: "valid" | "none" }[] };
  templates: { key: string; label: string }[];
  sender: { name: string; email: string } | null;
  bookingEnabled: boolean; sendReady: boolean; timezone: string;
  demoLinks: { key: "demo" | "demoBooking"; url: string }[];
}

export interface CaptureEmailInput { prospectId: string; contactId?: string | null; name?: string; title?: string; email: string; scope: EmailScope; isDecisionMaker?: boolean; sessionId?: string | null }
export type CaptureEmailResult =
  | { ok: true; contactId: string; created: boolean; basisRecorded: boolean; send: { allowed: boolean; reason: string | null; nextAction: "SEND" | "ACTIVATE_POLICY" | "RECORD_REQUEST" | "SUPPRESSED" | "CALL_BACK" } }
  | { ok: false; code: string };

export interface SaveContactInput { prospectId: string; contactId?: string | null; name: string; title?: string; email?: string; phone?: string; isDecisionMaker?: boolean; language?: "FR" | "EN" | "" }
export interface SaveDiscoveryInput { prospectId: string; sessionId?: string | null; currentSoftware?: string; painPoints?: string[]; objections?: ObjectionCode[]; notes?: string }
