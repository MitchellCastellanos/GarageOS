import "server-only";
import { Prisma } from "@prisma/client";
import { canonicalAddress } from "@/domain/sales-crm/address";
import { classifyAgainstPool, type MatchKey } from "@/domain/sales-crm/dedupe";
import { normalizeEmail, phoneDigits, websiteDomain } from "@/domain/sales-crm/normalize";
import { classifyTerritory, cityKey } from "@/domain/sales-crm/territory";
import { toCandidate, type RecordIssue, type StagedCandidate } from "@/domain/lead-radar/record";
import { screenCandidate, type ScreenReason } from "@/domain/lead-radar/commercial-screen";
import { clearRejections, recordRejections, type RejectionInput } from "@/lib/lead-radar/screening";
import { assessRepairFit } from "@/domain/lead-radar/repair-fit";
import { isIcpExclusion } from "@/domain/lead-radar/icp";
import { exclusionIdentityKey, tombstoneReasons, withTombstoneMarker } from "@/domain/lead-radar/icp-tombstone";
import { decideFor, loadExclusions, recordExclusions, type ExclusionInput } from "@/lib/lead-radar/exclusions";
import type { DiscoveryScope } from "@/domain/lead-radar/scope";
import { loadMatchPool } from "@/lib/sales-crm/lead-pool";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";
import { CrmError } from "@/lib/sales-crm/prospects";

export const MAX_CHUNK_RECORDS = 300;
export const MAX_CHUNK_BYTES = 1_500_000;
type Tx = Prisma.TransactionClient;

const IMPORTED = new Set(["CREATED", "LINKED", "SENT_TO_REVIEW"]);

export interface ChunkTally {
  received: number; stagedNew: number; stagedUpdated: number; rejected: number; issues: Record<string, number>;
  /** Source-coordinate accounting (so a coordinate-less extraction can never pass silently): records whose line carried a point, points accepted by the plausibility check,
   *  and how many accepted points were written onto NEW / already-existing candidates. */
  withPoint: number; pointsAccepted: number; pointsOnNew: number; pointsOnExisting: number;
  /** Early commercial screen: records not kept (tombstoned, never staged) and tombstoned records that now pass and were staged again. */
  screened: number; rediscovered: number;
}

export const matchKeyOf = (c: Pick<StagedCandidate, "nameNormalized" | "city" | "website" | "phone" | "address" | "postalCode" | "province">): MatchKey => {
  const a = canonicalAddress({ address: c.address, city: c.city, province: c.province, postalCode: c.postalCode });
  return { nameNormalized: c.nameNormalized, cityKey: cityKey(c.city), websiteDomain: websiteDomain(c.website), phoneDigits: phoneDigits(c.phone), addressKey: a.addressKey, postalKey: a.postalKey };
};

/**
 * Candidate-to-candidate duplicate detection (the same business re-keyed by the source, or reached through two overlapping plans). Reuses the CRM's conservative
 * classifier: only a STRONG outcome (same name AND the same physical place, or same name+city with a unique phone/domain) is a duplicate; ambiguous or branch-like
 * matches are never linked. Returns, per new source id, the ORIGINAL candidate id (chains collapsed to the root).
 */
export async function findCandidateDuplicates(tx: Tx, news: readonly StagedCandidate[]): Promise<Map<string, { originalId: string; reasons: string[] }>> {
  const out = new Map<string, { originalId: string; reasons: string[] }>();
  const names = [...new Set(news.map((c) => c.nameNormalized).filter(Boolean))];
  if (!names.length) return out;
  const rows = await tx.crmDiscoveryCandidate.findMany({
    // Originals only: an earlier duplicate is represented by its original, so a third record never sees a "duplicate pair" (which would read as ambiguous).
    where: { source: "OVERTURE", nameNormalized: { in: names }, duplicateOfCandidateId: null, sourceRecordId: { notIn: news.map((c) => c.sourceRecordId) } },
    select: { id: true, nameNormalized: true, city: true, address: true, province: true, postalCode: true, website: true, phone: true, duplicateOfCandidateId: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (!rows.length) return out;
  const byName = new Map<string, typeof rows>();
  for (const r of rows) byName.set(r.nameNormalized, [...(byName.get(r.nameNormalized) ?? []), r]);
  for (const c of news) {
    const group = byName.get(c.nameNormalized);
    if (!group) continue;
    const pool = group.map((r) => ({ ...matchKeyOf({ ...r, nameNormalized: r.nameNormalized } as Parameters<typeof matchKeyOf>[0]), id: r.id, doNotContact: false }));
    const cl = classifyAgainstPool(matchKeyOf(c), pool);
    if (cl.outcome !== "STRONG" || !cl.strong) continue;
    const hit = group.find((r) => r.id === cl.strong!.id)!;
    out.set(c.sourceRecordId, { originalId: hit.duplicateOfCandidateId ?? hit.id, reasons: cl.strong.reasons });
  }
  return out;
}

/** Parses one NDJSON chunk, normalises/classifies/geo-filters each record, de-duplicates against the CRM and writes staging rows. Idempotent per record. */
export async function stageChunk(tx: Tx, run: { id: string; scope: DiscoveryScope; release: string }, text: string): Promise<ChunkTally> {
  if (Buffer.byteLength(text, "utf8") > MAX_CHUNK_BYTES) throw new CrmError("CHUNK_TOO_LARGE");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > MAX_CHUNK_RECORDS) throw new CrmError("CHUNK_TOO_LARGE");
  const tally: ChunkTally = { received: lines.length, stagedNew: 0, stagedUpdated: 0, rejected: 0, issues: {}, withPoint: 0, pointsAccepted: 0, pointsOnNew: 0, pointsOnExisting: 0, screened: 0, rediscovered: 0 };
  const issue = (code: RecordIssue | "MALFORMED_JSON") => { tally.rejected++; tally.issues[code] = (tally.issues[code] ?? 0) + 1; };

  const objs: unknown[] = [];
  for (const l of lines) { try { objs.push(JSON.parse(l)); } catch { issue("MALFORMED_JSON"); } }

  // CASL protection: an address already on the suppression list is dropped from the candidate (the business itself stays stageable).
  const rawEmails = new Set<string>();
  for (const o of objs) for (const e of ((o as { emails?: unknown })?.emails as unknown[] | undefined) ?? []) if (typeof e === "string") { const n = normalizeEmail(e); if (n) rawEmails.add(n); }
  const suppressed = new Set((rawEmails.size ? await tx.crmEmailSuppression.findMany({ where: { emailNormalized: { in: [...rawEmails] }, liftedAt: null }, select: { emailNormalized: true } }) : []).map((r) => r.emailNormalized));

  const cityKeys = run.scope.cities.map(cityKey);
  const byId = new Map<string, StagedCandidate>();
  for (const o of objs) {
    const r = toCandidate(o, { provinces: run.scope.provinces, cityKeys }, { isSuppressed: (e) => suppressed.has(e), cityKeyOf: cityKey, release: run.release });
    if (!r.ok) { issue(r.issue); continue; }
    byId.set(r.candidate.sourceRecordId, r.candidate); // same id twice in one chunk: last wins
  }
  const cands = [...byId.values()];
  if (!cands.length) return tally;

  const existing = new Map((await tx.crmDiscoveryCandidate.findMany({ where: { source: "OVERTURE", sourceRecordId: { in: cands.map((c) => c.sourceRecordId) } } })).map((e) => [e.sourceRecordId, e]));
  const rules = await loadTerritoryRulesWith(tx);
  const now = new Date();
  // Exclusion tombstones for this batch (by exact source id and by exact place+name): a business excluded earlier — even under another id — is excluded again, never re-reviewed.
  const keyOf = (c: StagedCandidate) => exclusionIdentityKey({ nameNormalized: c.nameNormalized, address: c.address, city: c.city, province: c.province, postalCode: c.postalCode });
  const tombs = await loadExclusions(tx, cands.map((c) => ({ sourceRecordId: c.sourceRecordId, identityKey: keyOf(c) })));
  const toRecord: ExclusionInput[] = [];

  // Extraction-quality accounting covers EVERY record of the file (a point is a property of the extract, not of whether the business is kept): the run quality gate compares them with `received`.
  for (const c of cands) {
    if (c.sourcePointIssue !== "NO_SOURCE_COORDINATES") tally.withPoint++;
    if (c.sourceLatitude !== null) tally.pointsAccepted++;
    else { const code = c.sourcePointIssue === "NO_SOURCE_COORDINATES" ? "POINT_MISSING" : `POINT_${c.sourcePointIssue}`; tally.issues[code] = (tally.issues[code] ?? 0) + 1; }
  }
  // Early commercial screen (cheap, in memory, BEFORE matching/duplicate lookups and before any write): a record that is not a commercially useful independent repair shop in a
  // usable lane is never staged. It leaves only a tombstone (source id, reasons, fingerprint) so a later release that improves it is reconsidered.
  const pre = new Map<string, { cls: ReturnType<typeof classifyTerritory>; fit: ReturnType<typeof assessRepairFit>; identityKey: string | null; icpOverride: boolean; dec: ReturnType<typeof decideFor>; screenReasons: ScreenReason[] }>();
  const rejected: RejectionInput[] = [];
  for (const c of cands) {
    const prev = existing.get(c.sourceRecordId);
    const cls = classifyTerritory(rules, { province: c.province, city: c.city, postalCode: c.postalCode });
    const identityKey = keyOf(c);
    const dec = decideFor(tombs, { sourceRecordId: c.sourceRecordId, identityKey });
    const icpOverride = !!prev?.icpOverride || dec.kind === "OVERRIDE";
    let fit = assessRepairFit({ name: c.name, taxonomyPrimary: c.taxonomyPrimary, classReasons: c.classReasons, website: c.website, city: c.city, icpOverride, storedReasons: dec.kind === "EXCLUDE" ? tombstoneReasons(dec.tomb, dec.rekeyed) : null });
    if (!icpOverride && isIcpExclusion(fit.reasons)) {
      fit = { ...fit, reasons: (dec.kind === "EXCLUDE" && dec.rekeyed && !fit.reasons.includes("ICP_TOMBSTONE_REKEYED") ? [...withTombstoneMarker(fit.reasons), "ICP_TOMBSTONE_REKEYED"] : withTombstoneMarker(fit.reasons)) as typeof fit.reasons };
      if (!(prev && IMPORTED.has(prev.importState))) toRecord.push({ sourceRecordId: c.sourceRecordId, province: c.province, name: c.name, city: c.city, identityKey, reasons: fit.reasons, release: run.release });
    }
    const screen = screenCandidate({ licenseOk: c.licenseOk, tier: c.tier, fit: fit.fit, humanFitDecision: icpOverride, operatingStatus: c.operatingStatus, territory: cls.state, address: c.address, city: c.city, postalCode: c.postalCode, phone: c.phone, email: c.email });
    pre.set(c.sourceRecordId, { cls, fit, identityKey, icpOverride, dec, screenReasons: screen.reasons });
    if (!screen.lane && !prev) {
      rejected.push({ sourceRecordId: c.sourceRecordId, reasons: screen.reasons, fingerprint: c.contentFingerprint, province: c.province, release: run.release });
      tally.screened++;
      for (const r of screen.reasons) tally.issues[`SCREEN_${r}`] = (tally.issues[`SCREEN_${r}`] ?? 0) + 1;
    }
  }
  const rejectedIds = new Set(rejected.map((r) => r.sourceRecordId));
  const kept = cands.filter((c) => !rejectedIds.has(c.sourceRecordId));
  const toMatch = kept.filter((c) => !IMPORTED.has(existing.get(c.sourceRecordId)?.importState ?? ""));
  const pool = toMatch.length ? await loadMatchPool(toMatch.map(matchKeyOf), tx) : [];
  const dups = await findCandidateDuplicates(tx, kept.filter((c) => !existing.has(c.sourceRecordId)));

  const creates: Prisma.CrmDiscoveryCandidateCreateManyInput[] = [];
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  for (const c of kept) {
    const prev = existing.get(c.sourceRecordId);
    if (c.sourceLatitude !== null) { if (prev) tally.pointsOnExisting++; else tally.pointsOnNew++; }
    const { cls, fit: fitPre, icpOverride } = pre.get(c.sourceRecordId)!;
    const territoryKey = cls.state === "LOCAL" ? cls.rule!.key : cls.state === "NATIONAL" ? "national" : "unresolved";
    const facts = {
      name: c.name, nameNormalized: c.nameNormalized, address: c.address, city: c.city, province: c.province, postalCode: c.postalCode, phone: c.phone, website: c.website, email: c.email,
      territoryKey, taxonomyPrimary: c.taxonomyPrimary, tier: c.tier, industry: c.industry, classReasons: c.classReasons, chainSignal: c.chainSignal, sourceConfidence: c.sourceConfidence,
      completeness: c.completeness, qualityFlags: c.qualityFlags, licenses: c.licenses, datasets: c.datasets, licenseOk: c.licenseOk, contentFingerprint: c.contentFingerprint,
      emailProvenance: (c.emailProvenance ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue,
    };
    // Repair fit is derived from the same facts (computed once by the early screen above), so a business is classified the moment it is staged.
    const fit = fitPre;
    const fitData = { repairFit: fit.fit, repairFitReasons: fit.reasons as string[], repairFitAt: now };
    // The source point is refreshed whenever the extract carries one (never cleared by an extract without one) and is NOT a business fact:
    // it is outside contentFingerprint, so it never re-opens an approval, requalifies, or touches an imported prospect.
    const point = c.sourceLatitude !== null && c.sourceLongitude !== null ? { sourceLatitude: c.sourceLatitude, sourceLongitude: c.sourceLongitude } : {};
    if (prev && IMPORTED.has(prev.importState)) {
      // Already in the CRM: never re-stage or overwrite anything; only note that the source has moved on (and keep the source point fresh).
      updates.push(tx.crmDiscoveryCandidate.update({ where: { id: prev.id }, data: { lastRunId: run.id, lastSeenRelease: run.release, changedSinceImport: prev.changedSinceImport || prev.contentFingerprint !== c.contentFingerprint, ...point, ...(prev.repairFit === null ? fitData : {}) } }));
      tally.stagedUpdated++;
      continue;
    }
    const cl = classifyAgainstPool(matchKeyOf(c), pool);
    const match = cl.outcome === "STRONG" ? { matchState: "EXISTING_STRONG" as const, matchProspectId: cl.strong!.id, matchReasons: cl.strong!.reasons }
      : cl.outcome === "AMBIGUOUS" ? { matchState: "AMBIGUOUS" as const, matchProspectId: cl.ambiguous[0].id, matchReasons: [...new Set(cl.ambiguous.flatMap((a) => a.reasons))] }
      : cl.branchOf.length ? { matchState: "BRANCH_OF_EXISTING" as const, matchProspectId: cl.branchOf[0], matchReasons: [] as string[] }
      : { matchState: "NEW" as const, matchProspectId: null, matchReasons: [] as string[] };
    if (!prev) {
      const dup = dups.get(c.sourceRecordId);
      creates.push({ source: "OVERTURE", sourceRecordId: c.sourceRecordId, icpOverride, firstRunId: run.id, lastRunId: run.id, firstSeenRelease: run.release, lastSeenRelease: run.release, ...facts, ...fitData, ...point, ...match, matchedAt: now, ...(dup ? { duplicateOfCandidateId: dup.originalId } : {}) });
      tally.stagedNew++;
      if (dup) tally.issues.DUPLICATE_OF_STAGED = (tally.issues.DUPLICATE_OF_STAGED ?? 0) + 1;
    } else {
      const changed = prev.contentFingerprint !== c.contentFingerprint;
      // An approval was given on the OLD facts (or an old licence verdict): any material change sends it back to a human.
      const invalidated = prev.reviewState === "APPROVED" && (changed || !c.licenseOk || c.tier === "EXCLUDED");
      const matchMoved = prev.matchState !== match.matchState || prev.matchProspectId !== match.matchProspectId;
      const licenseMoved = !prev.licenseOk !== !c.licenseOk;
      // Qualification is a verdict on exactly these facts: when they (or the duplicate verdict) move, the lane is cleared so the active policy
      // re-evaluates the candidate. A HUMAN approval that a source change invalidated keeps a sticky SOURCE_CHANGED reason (only a human clears it);
      // a POLICY approval is simply re-evaluated — the policy approves facts, not people.
      // A release refresh re-applies the CURRENT classifier/ICP registry to every not-yet-imported candidate: a chain that was reviewable becomes excluded (and vice versa).
      const fitMoved = prev.repairFit !== fit.fit || (prev.repairFitReasons ?? []).join() !== fit.reasons.join();
      const requalify = changed || matchMoved || licenseMoved || fitMoved;
      const humanApprovalInvalidated = invalidated && prev.approvedByPolicyVersion === null;
      updates.push(tx.crmDiscoveryCandidate.update({
        where: { id: prev.id },
        data: {
          lastRunId: run.id, lastSeenRelease: run.release, ...(icpOverride && !prev.icpOverride ? { icpOverride } : {}), ...(changed || licenseMoved ? { ...facts, ...fitData } : { qualityFlags: c.qualityFlags, ...(prev.repairFit === null || fitMoved ? fitData : {}) }), ...point, ...match, matchedAt: now,
          ...(invalidated ? { reviewState: "PENDING" as const, reviewedByUserId: null, reviewedAt: null, approvedByPolicyVersion: null } : {}),
          ...(requalify ? { qualificationLane: null, qualificationPolicyVersion: null, qualifiedAt: null, qualificationReasons: humanApprovalInvalidated ? ["SOURCE_CHANGED"] : [] } : {}),
          // A candidate whose import failed on validation/territory grounds gets a fresh chance only when its facts actually changed.
          ...(changed && (prev.importState === "FAILED" || prev.importState === "SKIPPED") ? { importState: "NOT_IMPORTED" as const, importErrorCode: null, importAttempts: 0, importLastAttemptAt: null } : {}),
        },
      }));
      tally.stagedUpdated++;
    }
  }
  if (creates.length) await tx.crmDiscoveryCandidate.createMany({ data: creates, skipDuplicates: true });
  for (const u of updates) await u;
  await recordExclusions(tx, toRecord, tombs);
  await recordRejections(tx, rejected);
  tally.rediscovered = await clearRejections(tx, kept.map((c) => c.sourceRecordId));
  return tally;
}
