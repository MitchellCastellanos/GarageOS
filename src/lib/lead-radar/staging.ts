import "server-only";
import { Prisma } from "@prisma/client";
import { canonicalAddress } from "@/domain/sales-crm/address";
import { classifyAgainstPool, type MatchKey } from "@/domain/sales-crm/dedupe";
import { normalizeEmail, phoneDigits, websiteDomain } from "@/domain/sales-crm/normalize";
import { classifyTerritory, cityKey } from "@/domain/sales-crm/territory";
import { toCandidate, type RecordIssue, type StagedCandidate } from "@/domain/lead-radar/record";
import type { DiscoveryScope } from "@/domain/lead-radar/scope";
import { loadMatchPool } from "@/lib/sales-crm/lead-pool";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";
import { CrmError } from "@/lib/sales-crm/prospects";

export const MAX_CHUNK_RECORDS = 300;
export const MAX_CHUNK_BYTES = 1_500_000;
type Tx = Prisma.TransactionClient;

const IMPORTED = new Set(["CREATED", "LINKED", "SENT_TO_REVIEW"]);

export interface ChunkTally { received: number; stagedNew: number; stagedUpdated: number; rejected: number; issues: Record<string, number> }

export const matchKeyOf = (c: Pick<StagedCandidate, "nameNormalized" | "city" | "website" | "phone" | "address" | "postalCode" | "province">): MatchKey => {
  const a = canonicalAddress({ address: c.address, city: c.city, province: c.province, postalCode: c.postalCode });
  return { nameNormalized: c.nameNormalized, cityKey: cityKey(c.city), websiteDomain: websiteDomain(c.website), phoneDigits: phoneDigits(c.phone), addressKey: a.addressKey, postalKey: a.postalKey };
};

/** Parses one NDJSON chunk, normalises/classifies/geo-filters each record, de-duplicates against the CRM and writes staging rows. Idempotent per record. */
export async function stageChunk(tx: Tx, run: { id: string; scope: DiscoveryScope; release: string }, text: string): Promise<ChunkTally> {
  if (Buffer.byteLength(text, "utf8") > MAX_CHUNK_BYTES) throw new CrmError("CHUNK_TOO_LARGE");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > MAX_CHUNK_RECORDS) throw new CrmError("CHUNK_TOO_LARGE");
  const tally: ChunkTally = { received: lines.length, stagedNew: 0, stagedUpdated: 0, rejected: 0, issues: {} };
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
    const r = toCandidate(o, { provinces: run.scope.provinces, cityKeys }, { isSuppressed: (e) => suppressed.has(e), cityKeyOf: cityKey });
    if (!r.ok) { issue(r.issue); continue; }
    byId.set(r.candidate.sourceRecordId, r.candidate); // same id twice in one chunk: last wins
  }
  const cands = [...byId.values()];
  if (!cands.length) return tally;

  const existing = new Map((await tx.crmDiscoveryCandidate.findMany({ where: { source: "OVERTURE", sourceRecordId: { in: cands.map((c) => c.sourceRecordId) } } })).map((e) => [e.sourceRecordId, e]));
  const toMatch = cands.filter((c) => !IMPORTED.has(existing.get(c.sourceRecordId)?.importState ?? ""));
  const pool = await loadMatchPool(toMatch.map(matchKeyOf), tx);
  const rules = await loadTerritoryRulesWith(tx);
  const now = new Date();

  const creates: Prisma.CrmDiscoveryCandidateCreateManyInput[] = [];
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  for (const c of cands) {
    const prev = existing.get(c.sourceRecordId);
    const cls = classifyTerritory(rules, { province: c.province, city: c.city, postalCode: c.postalCode });
    const territoryKey = cls.state === "LOCAL" ? cls.rule!.key : cls.state === "NATIONAL" ? "national" : "unresolved";
    const facts = {
      name: c.name, nameNormalized: c.nameNormalized, address: c.address, city: c.city, province: c.province, postalCode: c.postalCode, phone: c.phone, website: c.website, email: c.email,
      territoryKey, taxonomyPrimary: c.taxonomyPrimary, tier: c.tier, industry: c.industry, classReasons: c.classReasons, chainSignal: c.chainSignal, sourceConfidence: c.sourceConfidence,
      completeness: c.completeness, qualityFlags: c.qualityFlags, licenses: c.licenses, datasets: c.datasets, licenseOk: c.licenseOk, contentFingerprint: c.contentFingerprint,
    };
    if (prev && IMPORTED.has(prev.importState)) {
      // Already in the CRM: never re-stage or overwrite anything; only note that the source has moved on.
      updates.push(tx.crmDiscoveryCandidate.update({ where: { id: prev.id }, data: { lastRunId: run.id, lastSeenRelease: run.release, changedSinceImport: prev.changedSinceImport || prev.contentFingerprint !== c.contentFingerprint } }));
      tally.stagedUpdated++;
      continue;
    }
    const cl = classifyAgainstPool(matchKeyOf(c), pool);
    const match = cl.outcome === "STRONG" ? { matchState: "EXISTING_STRONG" as const, matchProspectId: cl.strong!.id, matchReasons: cl.strong!.reasons }
      : cl.outcome === "AMBIGUOUS" ? { matchState: "AMBIGUOUS" as const, matchProspectId: cl.ambiguous[0].id, matchReasons: [...new Set(cl.ambiguous.flatMap((a) => a.reasons))] }
      : cl.branchOf.length ? { matchState: "BRANCH_OF_EXISTING" as const, matchProspectId: cl.branchOf[0], matchReasons: [] as string[] }
      : { matchState: "NEW" as const, matchProspectId: null, matchReasons: [] as string[] };
    if (!prev) {
      creates.push({ source: "OVERTURE", sourceRecordId: c.sourceRecordId, firstRunId: run.id, lastRunId: run.id, firstSeenRelease: run.release, lastSeenRelease: run.release, ...facts, ...match, matchedAt: now });
      tally.stagedNew++;
    } else {
      const changed = prev.contentFingerprint !== c.contentFingerprint;
      // An approval was given on the OLD facts (or an old licence verdict): any material change sends it back to a human.
      const invalidated = prev.reviewState === "APPROVED" && (changed || !c.licenseOk || c.tier === "EXCLUDED");
      const matchMoved = prev.matchState !== match.matchState || prev.matchProspectId !== match.matchProspectId;
      const licenseMoved = !prev.licenseOk !== !c.licenseOk;
      // Qualification is a verdict on exactly these facts: when they (or the duplicate verdict) move, the lane is cleared so the active policy
      // re-evaluates the candidate. A HUMAN approval that a source change invalidated keeps a sticky SOURCE_CHANGED reason (only a human clears it);
      // a POLICY approval is simply re-evaluated — the policy approves facts, not people.
      const requalify = changed || matchMoved || licenseMoved;
      const humanApprovalInvalidated = invalidated && prev.approvedByPolicyVersion === null;
      updates.push(tx.crmDiscoveryCandidate.update({
        where: { id: prev.id },
        data: {
          lastRunId: run.id, lastSeenRelease: run.release, ...(changed || licenseMoved ? facts : { qualityFlags: c.qualityFlags }), ...match, matchedAt: now,
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
  return tally;
}
