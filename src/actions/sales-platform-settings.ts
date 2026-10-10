"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { canPublish, safeHttpsUrl, VIDEO_KEY_RE } from "@/domain/platform-video";
import { isCorporateEmail } from "@/domain/sales-crm/identity";
import { normalizeEmail } from "@/domain/sales-crm/normalize";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError, requireScopedProspect, touchProspect } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { cityKey } from "@/domain/sales-crm/territory";

const csv = (v: string | undefined, max: number, f: (s: string) => string = (s) => s) =>
  [...new Set((v ?? "").split(/[,;\n]/).map((s) => f(s.trim())).filter(Boolean))].slice(0, max);

const territorySchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  nameEn: z.string().trim().min(2).max(100), nameFr: z.string().trim().min(2).max(100),
  acquisition: z.enum(["FIELD_EXCLUSIVE", "FIELD_PRIORITY", "REMOTE_DEFAULT"]),
  provinces: z.string().optional().transform((v) => csv(v, 14, (s) => s.toUpperCase().slice(0, 2))),
  cities: z.string().optional().transform((v) => csv(v, 400, cityKey)),
  postalPrefixes: z.string().optional().transform((v) => csv(v, 100, (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3))),
  priorityDays: z.union([z.literal(""), z.coerce.number().int().min(1).max(730)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  priorityStartedAt: z.string().optional().transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null)),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(100),
  active: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
});

/** Super Admin: create or update a territory (keyed). FIELD_PRIORITY needs a window; the catch-all must stay active. */
export async function saveTerritory(form: FormData) {
  const actor = await requireCrmActor("manage_team");
  return crmAction(async () => {
    const v = territorySchema.parse(Object.fromEntries(form));
    if (v.acquisition === "FIELD_PRIORITY" && (!v.priorityDays || !v.priorityStartedAt || Number.isNaN(v.priorityStartedAt.getTime()))) throw new CrmError("INVALID");
    if (v.priorityStartedAt && Number.isNaN(v.priorityStartedAt.getTime())) throw new CrmError("INVALID");
    const data = { nameEn: v.nameEn, nameFr: v.nameFr, acquisition: v.acquisition, provinces: v.provinces, cities: v.cities, postalPrefixes: v.postalPrefixes, priorityDays: v.acquisition === "FIELD_PRIORITY" ? v.priorityDays : null, priorityStartedAt: v.acquisition === "FIELD_PRIORITY" ? v.priorityStartedAt : null, sortOrder: v.sortOrder, active: v.active };
    const row = await db.crmTerritory.upsert({ where: { key: v.key }, create: { key: v.key, ...data }, update: data });
    await writeCrmAudit({ actorUserId: actor.userId, action: "TERRITORY_SAVED", entityType: "CrmTerritory", entityId: row.id, metadata: { key: v.key, acquisition: v.acquisition, active: v.active } });
    revalidatePath(PLATFORM.salesTerritories);
    return {};
  });
}

const videoSchema = z.object({
  key: z.string().trim().toLowerCase().regex(VIDEO_KEY_RE),
  language: z.enum(["EN", "FR"]),
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(500).optional().transform((v) => v || null),
  url: z.string().trim().max(500),
  thumbnailUrl: z.string().trim().max(500).optional().transform((v) => v || null),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  allowWebsite: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
  allowOutreach: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
});

/** Super Admin: create/update the (key, language) video. Publishing requires a real https URL; thumbnails must be https too. */
export async function saveVideo(form: FormData) {
  const actor = await requireCrmActor("manage_sequences");
  return crmAction(async () => {
    const v = videoSchema.parse(Object.fromEntries(form));
    const url = safeHttpsUrl(v.url);
    const thumb = v.thumbnailUrl ? safeHttpsUrl(v.thumbnailUrl) : null;
    if (v.thumbnailUrl && !thumb) throw new CrmError("VIDEO_URL_INVALID");
    if (v.status === "PUBLISHED" && !canPublish({ title: v.title, url: v.url })) throw new CrmError("VIDEO_NOT_PUBLISHABLE");
    if (!url && v.url) throw new CrmError("VIDEO_URL_INVALID");
    const existing = await db.platformVideo.findUnique({ where: { key_language: { key: v.key, language: v.language } } });
    const data = { title: v.title, description: v.description, url: url ?? v.url, thumbnailUrl: thumb, status: v.status, allowWebsite: v.allowWebsite, allowOutreach: v.allowOutreach, updatedByUserId: actor.userId, publishedAt: v.status === "PUBLISHED" ? existing?.publishedAt ?? new Date() : null };
    const row = existing
      ? await db.platformVideo.update({ where: { id: existing.id }, data })
      : await db.platformVideo.create({ data: { key: v.key, language: v.language, ...data } });
    await writeCrmAudit({ actorUserId: actor.userId, action: v.status === "PUBLISHED" ? "VIDEO_PUBLISHED" : "VIDEO_SAVED", entityType: "PlatformVideo", entityId: row.id, metadata: { key: v.key, language: v.language, status: v.status } });
    revalidatePath(PLATFORM.salesVideos);
    revalidateTag("platform-videos", { expire: 0 }); // public website/watch pages pick the change up now, not after the 5-minute cache
    return {};
  });
}

/** FIELD agents (and Super Admin) document an in-person visit. It is what unlocks follow-up email in field-held territories. */
export async function logFieldVisit(prospectId: string, note: string) {
  const actor = await requireCrmActor("log_field_visits");
  return crmAction(async () => {
    await requireScopedProspect(actor, prospectId);
    const body = String(note ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, 2000);
    if (body.length < 3) throw new CrmError("NOTE_REQUIRED");
    const opp = await db.crmOpportunity.findFirst({ where: { prospectId, stage: { in: ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] } }, select: { id: true } });
    await db.$transaction(async (tx) => {
      await tx.crmActivity.create({ data: { prospectId, opportunityId: opp?.id ?? null, type: "FIELD_VISIT", subject: "Field visit", body, authorUserId: actor.userId } });
      await touchProspect(tx, prospectId);
      await writeCrmAudit({ actorUserId: actor.userId, action: "FIELD_VISIT_LOGGED", entityType: "CrmProspect", entityId: prospectId, prospectId }, tx);
    });
    revalidatePath(PLATFORM.salesProspect(prospectId));
    return {};
  });
}

/** Test recipients: SALES_TEST_RECIPIENTS (comma list, owner-controlled) plus the Super Admin's own login. */
function allowedTestRecipients(adminEmail: string): Set<string> {
  const list = (process.env.SALES_TEST_RECIPIENTS ?? "").split(",").map((s) => normalizeEmail(s)).filter((s): s is string => !!s);
  return new Set([...list, normalizeEmail(adminEmail)!]);
}

/**
 * Super Admin: prepares an internal TEST prospect + contact for an address the owner controls, with a documented sending
 * basis, so a real labelled test can go through the normal composer/dispatch pipeline (signature, footer, unsubscribe, queue).
 * It does NOT send anything and cannot be pointed at an arbitrary third-party address.
 */
export async function createTestRecipient(email: string) {
  const actor = await requireCrmActor("manage_sender_identities");
  return crmAction(async () => {
    const to = normalizeEmail(email);
    if (!to || !z.email().safeParse(to).success) throw new CrmError("TEST_RECIPIENT_INVALID");
    const me = await db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { email: true } });
    if (!allowedTestRecipients(me.email).has(to) || isCorporateEmail(to) && to !== normalizeEmail(me.email)) throw new CrmError("TEST_RECIPIENT_NOT_ALLOWED");
    const existing = await db.crmContact.findFirst({ where: { emailNormalized: to, archivedAt: null, prospect: { tags: { has: "internal-test" } } }, select: { id: true, prospectId: true } });
    if (existing) return { prospectId: existing.prospectId, contactId: existing.id, created: false };
    const created = await db.$transaction(async (tx) => {
      const prospect = await tx.crmProspect.create({ data: { name: "[TEST] GarageOS internal test recipient", nameNormalized: `test garageos internal ${to}`, tags: ["internal-test"], preferredLanguage: "EN", source: "OTHER", sourceDetail: "Internal delivery test", assignedStaffId: actor.staffId, createdByUserId: actor.userId, email: to } });
      await tx.crmOpportunity.create({ data: { prospectId: prospect.id, assignedStaffId: actor.staffId, createdByUserId: actor.userId } });
      const contact = await tx.crmContact.create({ data: { prospectId: prospect.id, name: "Test Recipient", email: to, emailNormalized: to, isPrimary: true } });
      await tx.crmSendingBasis.create({ data: { contactId: contact.id, kind: "EXPRESS_CONSENT", evidence: "Owner-authorised internal test recipient; every message is labelled as a test.", recordedByUserId: actor.userId } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "TEST_EMAIL_SENT", entityType: "CrmProspect", entityId: prospect.id, prospectId: prospect.id, metadata: { kind: "TEST_RECIPIENT_PREPARED" } }, tx);
      return { prospectId: prospect.id, contactId: contact.id };
    });
    revalidatePath(PLATFORM.salesProspects);
    return { ...created, created: true };
  });
}
