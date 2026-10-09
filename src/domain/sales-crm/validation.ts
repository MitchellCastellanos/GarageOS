import { z } from "zod";
import { cleanPhone, cleanText, neutralizeFormula } from "@/domain/sales-crm/csv";
import { normalizeWebsite } from "@/domain/sales-crm/normalize";
import { LOSS_REASONS } from "@/domain/sales-crm/pipeline";

export const LANGUAGES = ["FR", "EN", "UNKNOWN"] as const;
export const INDUSTRIES = ["GENERAL_REPAIR", "TIRE_SHOP", "BODY_SHOP", "TRANSMISSION", "DIAGNOSTIC", "SPECIALTY", "FLEET", "OTHER"] as const;
export const SHOP_SIZES = ["SOLO", "SMALL", "MEDIUM", "LARGE"] as const;
export const LEAD_SOURCES = ["REFERRAL", "WEBSITE", "COLD_OUTBOUND", "EVENT", "DIRECTORY", "PARTNER", "IMPORT", "OTHER"] as const;
export const NEED_SEVERITIES = ["NONE", "LOW", "MEDIUM", "HIGH"] as const;
export const LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export const EVIDENCE_BASES = ["CONFIRMED", "INFERRED"] as const;
export const ACTIVITY_TYPES_MANUAL = ["NOTE", "CALL", "MEETING", "EMAIL_LOGGED"] as const;
export const ACTIVITY_OUTCOMES = ["CONNECTED", "VOICEMAIL", "NO_ANSWER", "WRONG_NUMBER", "INTERESTED", "NOT_INTERESTED", "FOLLOW_UP_NEEDED"] as const;
export const TASK_TYPES = ["FOLLOW_UP", "CALL", "EMAIL", "DEMO_PREP", "OTHER"] as const;

/** Free text: trimmed, control characters removed, optional, formula-neutralized (it may be exported later). */
const text = (max: number) => z.string().transform((v) => neutralizeFormula(cleanText(v))).pipe(z.string().max(max)).optional().transform((v) => v || null);
/** Multi-line notes keep newlines but lose control characters. */
const longText = (max: number) => z.string().transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim()).pipe(z.string().max(max)).optional().transform((v) => v || null);
const email = z.string().trim().toLowerCase().pipe(z.union([z.literal(""), z.email().max(254)])).optional().transform((v) => v || null);
const phone = z.string().optional().transform((v, ctx) => {
  if (!v || !v.trim()) return null;
  const cleaned = cleanPhone(v);
  if (!cleaned) { ctx.addIssue({ code: "custom", message: "INVALID_PHONE" }); return z.NEVER; }
  return cleaned;
});
const website = z.string().optional().transform((v, ctx) => {
  if (!v || !v.trim()) return null;
  const url = normalizeWebsite(v);
  if (!url || url.length > 300) { ctx.addIssue({ code: "custom", message: "INVALID_WEBSITE" }); return z.NEVER; }
  return url;
});
const enumOrNull = <T extends readonly [string, ...string[]]>(values: T) =>
  z.union([z.literal(""), z.enum(values)]).optional().transform((v) => (v ? (v as T[number]) : null));
const tags = z.string().optional().transform((v) =>
  [...new Set((v ?? "").split(/[,;|]/).map((t) => neutralizeFormula(cleanText(t)).slice(0, 40)).filter(Boolean))].slice(0, 12));
const checkbox = z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true" || v === "yes" || v === "1");

export const prospectInputSchema = z.object({
  name: z.string().transform((v) => neutralizeFormula(cleanText(v))).pipe(z.string().min(1).max(120)),
  website, address: text(200), city: text(80), province: text(60), postalCode: text(12),
  phone, email,
  industry: enumOrNull(INDUSTRIES), shopSize: enumOrNull(SHOP_SIZES),
  locationCount: z.coerce.number().int().min(1).max(1000).optional().transform((v) => v ?? 1),
  currentSoftware: text(100),
  source: z.enum(LEAD_SOURCES).default("OTHER"), sourceDetail: text(120),
  preferredLanguage: z.enum(LANGUAGES).default("UNKNOWN"),
  tags, notes: longText(5000),
  assignedStaffId: z.string().max(40).optional().transform((v) => v || null),
});
export type ProspectInput = z.output<typeof prospectInputSchema>;

export const contactInputSchema = z.object({
  name: z.string().transform((v) => neutralizeFormula(cleanText(v))).pipe(z.string().min(1).max(100)),
  title: text(100), email, phone,
  isPrimary: checkbox, isDecisionMaker: checkbox,
  preferredLanguage: z.union([z.literal(""), z.enum(["FR", "EN"])]).optional().transform((v) => (v ? (v as "FR" | "EN") : null)),
  notes: longText(1000),
}).refine((c) => c.email || c.phone, { message: "CONTACT_METHOD_REQUIRED", path: ["email"] });
export type ContactInput = z.output<typeof contactInputSchema>;

export const activityInputSchema = z.object({
  type: z.enum(ACTIVITY_TYPES_MANUAL),
  outcome: enumOrNull(ACTIVITY_OUTCOMES),
  subject: text(150),
  body: longText(4000),
  contactId: z.string().max(40).optional().transform((v) => v || null),
  /** ISO instant; defaults to now, never more than 5 minutes in the future. */
  occurredAt: z.string().optional().transform((v) => (v ? new Date(v) : new Date())),
}).refine((a) => a.body || a.subject, { message: "CONTENT_REQUIRED", path: ["body"] })
  .refine((a) => !Number.isNaN(a.occurredAt.getTime()) && a.occurredAt.getTime() <= Date.now() + 5 * 60_000, { message: "INVALID_DATE", path: ["occurredAt"] });
export type ActivityInput = z.output<typeof activityInputSchema>;

export const taskInputSchema = z.object({
  title: z.string().transform((v) => neutralizeFormula(cleanText(v))).pipe(z.string().min(1).max(150)),
  type: z.enum(TASK_TYPES).default("FOLLOW_UP"),
  priority: z.enum(LEVELS).default("MEDIUM"),
  notes: longText(2000),
  /** Calendar date in the assignee's timezone (YYYY-MM-DD) and optional HH:mm (default 09:00). */
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().transform((v) => v ?? "09:00"),
  assignedStaffId: z.string().max(40).optional().transform((v) => v || null),
});
export type TaskInput = z.output<typeof taskInputSchema>;

export const needInputSchema = z.object({
  definitionId: z.string().min(1).max(40),
  severity: z.enum(NEED_SEVERITIES),
  priority: z.enum(LEVELS).default("MEDIUM"),
  basis: z.enum(EVIDENCE_BASES),
  evidence: longText(1000), notes: longText(1000),
}).refine((n) => n.basis !== "CONFIRMED" || !!n.evidence, { message: "EVIDENCE_REQUIRED_FOR_CONFIRMED", path: ["evidence"] });

export const opportunityUpdateSchema = z.object({
  urgency: enumOrNull(LEVELS),
  estimatedPlan: enumOrNull(["CORE", "PRO", "COMPLETE"] as const),
  /** Dollars (CAD, monthly); stored as cents. */
  estimatedMrr: z.string().optional().transform((v, ctx) => {
    if (!v || !v.trim()) return null;
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100000) { ctx.addIssue({ code: "custom", message: "INVALID_AMOUNT" }); return z.NEVER; }
    return Math.round(n * 100);
  }),
  expectedCloseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform((v) => (v ? new Date(`${v}T12:00:00Z`) : null)),
});

export const stageChangeSchema = z.object({
  lossReason: z.union([z.literal(""), z.enum(LOSS_REASONS)]).optional().transform((v) => v || null),
  note: longText(1000),
});

export const scoreOverrideSchema = z.object({
  kind: z.enum(["fit", "intent"]),
  /** null clears the override. */
  value: z.union([z.literal(""), z.coerce.number().int().min(0).max(100)]).transform((v) => (v === "" ? null : v)),
  reason: longText(500),
}).refine((o) => o.value === null || !!o.reason, { message: "REASON_REQUIRED", path: ["reason"] });

export const staffInputSchema = z.object({
  name: z.string().transform((v) => neutralizeFormula(cleanText(v))).pipe(z.string().min(1).max(100)),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  role: z.enum(["SALES_REP", "SALES_MANAGER"]),
  title: text(100), phone,
  managerId: z.string().max(40).optional().transform((v) => v || null),
  territories: z.string().optional().transform((v) =>
    [...new Set((v ?? "").split(/[,;\n]/).map((t) => cleanText(t).slice(0, 60)).filter(Boolean))].slice(0, 30)),
  uiLocale: z.enum(["EN", "FR"]).default("EN"),
  timezone: z.string().max(60).default("America/Toronto").refine((tz) => {
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
  }, "INVALID_TIMEZONE"),
  displayName: text(100),
  signatureText: longText(1000),
  defaultMeetingMinutes: z.coerce.number().int().min(5).max(480).default(30),
  meetingBufferMinutes: z.coerce.number().int().min(0).max(240).default(10),
});
export type StaffInput = z.output<typeof staffInputSchema>;

export const passwordSchema = z.string().min(10).max(128);
