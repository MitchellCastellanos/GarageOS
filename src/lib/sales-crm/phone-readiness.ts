import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { LEAD_RADAR_SOURCE_KEY } from "@/domain/lead-radar/bridge";
import { normalizeCanadianPhone } from "@/domain/sales-crm/phone";
import { DEFAULT_HELD_PROVINCES, evaluatePhoneEligibility, type PhoneBusinessBasis } from "@/domain/sales-crm/phone-eligibility";

type Tx = Prisma.TransactionClient | typeof db;

// Derived phone readiness for CrmProspect (docs/phone-first-calling-policy.md). Everything here is recomputable from facts that already exist, so it is idempotent and safe to resume:
// the same prospect always evaluates to the same row, a repeated run changes nothing, and an interrupted run continues from `next`. A dial attempt must call
// `evaluatePhoneEligibility` again on live facts (this table is for inventory and queues, never the authority at call time).

export const PHONE_EVAL_PAGE = 500;

export interface PhoneRefreshTally { examined: number; changed: number; byStatus: Record<string, number>; byReason: Record<string, number>; next: string | null }

/** Business-contact evidence for a number, from what is actually on record. Never infers "business" without a source that says so. */
export function businessBasisOf(p: { phoneBusinessBasis: PhoneBusinessBasis | null; importBatch: { sourceKey: string | null } | null }): PhoneBusinessBasis {
  // A human decision (operator verified / sole proprietor flagged) always wins over the automatic reading.
  if (p.phoneBusinessBasis === "OPERATOR_VERIFIED" || p.phoneBusinessBasis === "SOLE_PROPRIETOR_SUSPECTED") return p.phoneBusinessBasis;
  return p.importBatch?.sourceKey === LEAD_RADAR_SOURCE_KEY ? "LISTED_BUSINESS_SOURCE" : "UNKNOWN";
}

export async function loadHeldProvinces(client: Tx = db): Promise<ReadonlySet<string>> {
  // Provinces held pending a legal determination: the audited Super Admin setting (CrmVoiceSettings.heldProvinces, default BC + MB); the PHONE_HELD_PROVINCES env only applies if the settings row cannot be read.
  try {
    const row = await client.crmVoiceSettings.findUnique({ where: { id: "default" }, select: { heldProvinces: true } });
    if (row) return new Set(row.heldProvinces.map((x) => x.toUpperCase()));
  } catch { /* settings table unavailable: fall through to the conservative default */ }
  const raw = process.env.PHONE_HELD_PROVINCES;
  if (raw === undefined) return DEFAULT_HELD_PROVINCES;
  return new Set(raw.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean));
}

export async function refreshPhoneEligibility(opts: { after?: string | null; limit?: number; deadline?: number; prospectIds?: readonly string[]; dryRun?: boolean } = {}, client: Tx = db): Promise<PhoneRefreshTally> {
  const limit = Math.min(Math.max(1, opts.limit ?? PHONE_EVAL_PAGE), 2000);
  const held = await loadHeldProvinces(client);
  const t: PhoneRefreshTally = { examined: 0, changed: 0, byStatus: {}, byReason: {}, next: null };
  const rows = await client.crmProspect.findMany({
    where: opts.prospectIds ? { id: { in: [...opts.prospectIds] } } : opts.after ? { id: { gt: opts.after } } : {},
    orderBy: { id: "asc" }, take: limit,
    select: {
      id: true, status: true, mergedIntoId: true, doNotContact: true, territoryState: true, repairFit: true, province: true, phone: true, phoneDigits: true, createdAt: true, sourceDetail: true,
      phoneE164: true, phoneBusinessBasis: true, phoneEligibility: true, phoneEligibilityReasons: true, phoneKind: true, phoneSource: true,
      importBatch: { select: { sourceKey: true } },
    },
  });
  if (!rows.length) return t;

  const e164s = [...new Set(rows.map((r) => normalizeCanadianPhone(r.phone)?.e164).filter((x): x is string => !!x))];
  const digits = [...new Set(rows.map((r) => r.phoneDigits).filter((x): x is string => !!x))];
  const [suppressions, sameNumber] = await Promise.all([
    client.crmPhoneSuppression.findMany({ where: { liftedAt: null, OR: [{ prospectId: { in: rows.map((r) => r.id) } }, ...(e164s.length ? [{ phoneE164: { in: e164s } }] : [])] }, select: { scope: true, phoneE164: true, prospectId: true } }),
    digits.length ? client.crmProspect.findMany({ where: { phoneDigits: { in: digits }, status: "ACTIVE", mergedIntoId: null }, select: { id: true, phoneDigits: true, createdAt: true } }) : Promise.resolve([]),
  ]);
  const suppNumbers = new Set(suppressions.filter((s) => s.phoneE164).map((s) => s.phoneE164!));
  const suppBusiness = new Set(suppressions.filter((s) => s.scope === "BUSINESS" && s.prospectId).map((s) => s.prospectId!));
  const holders = new Map<string, { id: string; createdAt: Date }[]>();
  for (const h of sameNumber) { if (!h.phoneDigits) continue; (holders.get(h.phoneDigits) ?? holders.set(h.phoneDigits, []).get(h.phoneDigits)!).push({ id: h.id, createdAt: h.createdAt }); }

  const now = new Date();
  for (const r of rows) {
    if (opts.deadline && Date.now() > opts.deadline) { t.next = rows[rows.indexOf(r) - 1]?.id ?? opts.after ?? null; return t; }
    t.examined++;
    const basis = businessBasisOf(r);
    const same = r.phoneDigits ? holders.get(r.phoneDigits) ?? [] : [];
    const sharedWithOlder = same.some((h) => h.id !== r.id && (h.createdAt < r.createdAt || (h.createdAt.getTime() === r.createdAt.getTime() && h.id < r.id)));
    const e164 = normalizeCanadianPhone(r.phone)?.e164 ?? null;
    const ev = evaluatePhoneEligibility({
      status: r.status, merged: !!r.mergedIntoId, doNotContact: r.doNotContact, territoryState: r.territoryState, repairFit: r.repairFit, province: r.province, phone: r.phone, businessBasis: basis,
      numberSuppressed: !!e164 && suppNumbers.has(e164), businessSuppressed: suppBusiness.has(r.id), sharedWithOlderRecord: sharedWithOlder, heldProvinces: held,
    });
    t.byStatus[ev.status] = (t.byStatus[ev.status] ?? 0) + 1;
    for (const reason of ev.reasons) t.byReason[reason] = (t.byReason[reason] ?? 0) + 1;
    const reasons = ev.reasons as string[];
    const source = r.phone ? (r.importBatch?.sourceKey === LEAD_RADAR_SOURCE_KEY ? "OVERTURE" : "MANUAL_OR_CSV") : null;
    const same_ =
      r.phoneEligibility === ev.status && r.phoneE164 === e164 && r.phoneBusinessBasis === basis && r.phoneKind === (ev.phone?.kind ?? null) && r.phoneSource === source &&
      r.phoneEligibilityReasons.length === reasons.length && r.phoneEligibilityReasons.every((x, i) => x === reasons[i]);
    if (same_) continue;
    if (opts.dryRun) { t.changed++; continue; }
    await client.crmProspect.update({
      where: { id: r.id },
      data: { phoneE164: e164, phoneKind: ev.phone?.kind ?? null, phoneSource: source, phoneSourceRef: r.sourceDetail?.slice(0, 120) ?? null, phoneBusinessBasis: basis, phoneEligibility: ev.status, phoneEligibilityReasons: reasons, phoneEvaluatedAt: now },
    });
    t.changed++;
  }
  t.next = rows.length === limit ? rows[rows.length - 1].id : null;
  return t;
}

/** Inventory by province and status, straight from the derived columns. */
export async function phoneInventory(client: Tx = db) {
  const rows = await client.crmProspect.groupBy({ by: ["province", "phoneEligibility"], where: { status: "ACTIVE", mergedIntoId: null }, _count: { _all: true } });
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) { const k = r.province ?? "?"; (out[k] ??= {})[r.phoneEligibility ?? "NOT_EVALUATED"] = r._count._all; }
  return out;
}

// ── Internal DNC (immediate, append-only) ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A do-not-contact request on a business suppresses the business AND its number everywhere that number appears. Idempotent (an active entry is not duplicated). */
export async function suppressPhoneForProspect(tx: Tx, prospectId: string, actorUserId: string | null, reason: string, note: string | null): Promise<void> {
  const p = await tx.crmProspect.findUnique({ where: { id: prospectId }, select: { phone: true, phoneE164: true } });
  const e164 = p?.phoneE164 ?? normalizeCanadianPhone(p?.phone)?.e164 ?? null;
  const base = { reason, source: "CRM", note, createdByUserId: actorUserId, prospectId };
  if (!(await tx.crmPhoneSuppression.findFirst({ where: { scope: "BUSINESS", prospectId, liftedAt: null }, select: { id: true } }))) await tx.crmPhoneSuppression.create({ data: { ...base, scope: "BUSINESS" } });
  if (e164 && !(await tx.crmPhoneSuppression.findFirst({ where: { scope: "NUMBER", phoneE164: e164, liftedAt: null }, select: { id: true } }))) await tx.crmPhoneSuppression.create({ data: { ...base, scope: "NUMBER", phoneE164: e164 } });
  await refreshPhoneEligibility({ prospectIds: [prospectId] }, tx);
}

/** Lifts only the entries that belong to this prospect (reinstatement); entries are stamped, never deleted. */
export async function liftPhoneSuppressionForProspect(tx: Tx, prospectId: string, actorUserId: string, note: string | null): Promise<void> {
  const p = await tx.crmProspect.findUnique({ where: { id: prospectId }, select: { phoneE164: true } });
  await tx.crmPhoneSuppression.updateMany({ where: { liftedAt: null, OR: [{ scope: "BUSINESS", prospectId }, ...(p?.phoneE164 ? [{ scope: "NUMBER" as const, phoneE164: p.phoneE164, prospectId }] : [])] }, data: { liftedAt: new Date(), liftedByUserId: actorUserId, liftNote: note } });
  await refreshPhoneEligibility({ prospectIds: [prospectId] }, tx);
}

/** A number that is wrong or must not be dialled again (wrong number, invalid, disconnected): suppresses that exact number everywhere it appears. Idempotent. */
export async function suppressPhoneNumber(tx: Tx, p: { e164: string; prospectId: string | null; userId: string | null; reason: string; source: string; note: string | null }): Promise<void> {
  if (!(await tx.crmPhoneSuppression.findFirst({ where: { scope: "NUMBER", phoneE164: p.e164, liftedAt: null }, select: { id: true } }))) {
    await tx.crmPhoneSuppression.create({ data: { scope: "NUMBER", phoneE164: p.e164, prospectId: p.prospectId, reason: p.reason, source: p.source, note: p.note, createdByUserId: p.userId } });
  }
  const holders = await tx.crmProspect.findMany({ where: { phoneE164: p.e164 }, select: { id: true } });
  if (holders.length) await refreshPhoneEligibility({ prospectIds: holders.map((h) => h.id) }, tx);
}
