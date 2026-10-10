import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { evaluateSendingBasis, type BasisRow } from "@/domain/sales-comms/casl";

/**
 * Legacy sending bases = rows with `reviewStatus IS NULL` (created before the Lead Engine; the migration does not touch
 * them, so they behave exactly as before). The explicit reclassification procedure marks selected kinds LEGACY_UNREVIEWED.
 * For address-based kinds that REMOVES sendability until fresh structured evidence is approved; for the other kinds it is a
 * bookkeeping mark with no behavioural effect. The impact below is computed with the REAL policy function (before vs after),
 * so the preview cannot disagree with what the composer, worker and dispatcher will do.
 */
export const LEGACY_KINDS = ["EXPRESS_CONSENT", "IMPLIED_EXISTING_RELATIONSHIP", "IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS", "EXEMPT"] as const;
export type LegacyKind = (typeof LEGACY_KINDS)[number];
export const DEFAULT_LEGACY_KINDS: LegacyKind[] = ["IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS"];
export const LEGACY_BATCH_LIMIT = 2000;

export function sanitizeKinds(raw: unknown): LegacyKind[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const set = new Set<LegacyKind>();
  for (const k of raw) { if (!(LEGACY_KINDS as readonly string[]).includes(k)) return null; set.add(k as LegacyKind); }
  return [...set].sort();
}

type Client = Prisma.TransactionClient | typeof db;
export interface LegacyImpact {
  kinds: LegacyKind[];
  /** Rows in THIS batch (oldest first, max LEGACY_BATCH_LIMIT) and rows still unclassified for these kinds overall. */
  batchRows: number; remainingRows: number;
  byKind: Record<string, number>;
  contactsAffected: number;
  /** Contacts that can send today and could not afterwards. */
  contactsLosingSendability: number;
  activeEnrollments: number; queuedCommercialMessages: number;
  sample: { prospectId: string; prospectName: string }[];
  /** Binds an execute call to exactly the state that was previewed. */
  token: string; ids: string[];
}

export async function computeLegacyImpact(kindsIn: LegacyKind[], client: Client = db, now = new Date()): Promise<LegacyImpact> {
  const kinds = [...kindsIn].sort();
  const where = { reviewStatus: null, kind: { in: kinds } } satisfies Prisma.CrmSendingBasisWhereInput;
  const [rows, remaining] = await Promise.all([
    client.crmSendingBasis.findMany({ where, orderBy: [{ recordedAt: "asc" }, { id: "asc" }], take: LEGACY_BATCH_LIMIT, select: { id: true, kind: true, contactId: true } }),
    client.crmSendingBasis.count({ where }),
  ]);
  const ids = rows.map((r) => r.id), idSet = new Set(ids);
  const contactIds = [...new Set(rows.map((r) => r.contactId))];
  const all = contactIds.length
    ? await client.crmSendingBasis.findMany({ where: { contactId: { in: contactIds } }, select: { id: true, contactId: true, kind: true, evidence: true, recordedAt: true, expiresAt: true, revokedAt: true, reviewStatus: true } })
    : [];
  const byContact = new Map<string, (BasisRow & { id: string })[]>();
  for (const b of all) byContact.set(b.contactId, [...(byContact.get(b.contactId) ?? []), b]);
  const losing: string[] = [];
  for (const [cid, list] of byContact) {
    const before = evaluateSendingBasis(list, now).valid;
    const after = evaluateSendingBasis(list.map((b) => (idSet.has(b.id) ? { ...b, reviewStatus: "LEGACY_UNREVIEWED" as const } : b)), now).valid;
    if (before && !after) losing.push(cid);
  }
  const [enrollments, messages, sample] = await Promise.all([
    losing.length ? client.crmSequenceEnrollment.count({ where: { contactId: { in: losing }, status: { in: ["ACTIVE", "PAUSED"] } } }) : 0,
    losing.length ? client.crmEmailMessage.count({ where: { contactId: { in: losing }, category: "COMMERCIAL", status: { in: ["QUEUED", "SCHEDULED"] } } }) : 0,
    losing.length ? client.crmContact.findMany({ where: { id: { in: losing.slice(0, 20) } }, select: { prospect: { select: { id: true, name: true } } } }) : [],
  ]);
  const byKind: Record<string, number> = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  const token = createHash("sha256").update(JSON.stringify([kinds, ids, [...losing].sort(), remaining])).digest("hex").slice(0, 32);
  return {
    kinds, batchRows: rows.length, remainingRows: remaining, byKind, contactsAffected: contactIds.length, contactsLosingSendability: losing.length,
    activeEnrollments: enrollments, queuedCommercialMessages: messages, sample: sample.map((c) => ({ prospectId: c.prospect.id, prospectName: c.prospect.name })), token, ids,
  };
}
