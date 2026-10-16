#!/usr/bin/env -S npx tsx
// READ-ONLY, reproducible C2 audit of one province's staged candidates (e.g. Alberta in production), run from your own machine or CI:
//
//   DATABASE_URL=<connection string> npx tsx scripts/lead-radar/c2-audit.ts sample --province AB --seed c2-AB-1 --out ./c2
//   DATABASE_URL=<connection string> npx tsx scripts/lead-radar/c2-audit.ts impact --province AB --out ./c2
//   npx tsx scripts/lead-radar/c2-audit.ts score --sample ./c2/audit-sample.json --labels ./c2/audit-labels.json --out ./c2     (no database)
//
// sample  Draws 50 VERIFIED_REPAIR, 50 EXCLUDED, 25 HUMAN_REVIEW and 10 duplicate-or-CRM-match candidates, ordered by md5(Overture id || seed) — the same seed yields the same
//         sample on the same data in any environment. Writes audit-sample.json/.md (name, category, address, website, classification evidence, match reasons and the matched record's name/city/domain)
//         and audit-labels.template.json for the reviewer. It NEVER fetches a website: nothing is "verified" unless the reviewer sets websiteChecked=true.
// impact  Counts the candidates whose CRM match could come from a shared directory/banner domain, shared toll-free number or banner name, and lists the already-LINKED
//         candidates that were linked through the unknown-address paths (the only auto-link paths that depended on a "unique" phone/domain) for a human to look at.
// score   Computes precision / exclusion error / incorrect matches against the documented thresholds from the reviewer's labels.
//
// Guarantees: ONE `BEGIN READ ONLY` transaction (the database rejects any write); SELECT only; never prints the connection string; no phone numbers or emails are written.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { C2_THRESHOLDS, scoreAudit, type AuditLabel, type Stratum } from "../../src/domain/lead-radar/c2-audit";
import { assessRepairFit, commercialSegment } from "../../src/domain/lead-radar/repair-fit";
import { isBannerName, isSharedIdentityDomain } from "../../src/domain/sales-crm/shared-identity";
import { websiteDomain } from "../../src/domain/sales-crm/normalize";

const arg = (name: string, def?: string) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] ?? "" : def; };
const mode = process.argv[2];
const out = arg("out", "./c2-audit")!;
const SIZES = { VERIFIED_REPAIR: 50, EXCLUDED: 50, HUMAN_REVIEW: 25, MATCHES: 10 } as const;

async function withReadOnly<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) { console.error("Set DATABASE_URL (or DIRECT_URL)."); process.exit(2); }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try { await client.query("BEGIN READ ONLY"); return await fn(client); } finally { await client.query("ROLLBACK").catch(() => undefined); await client.end(); }
}

const COLS = `c."id", c."sourceRecordId", c."name", c."taxonomyPrimary", c."tier", c."classReasons", c."chainSignal", c."address", c."city", c."province", c."postalCode", c."website", c."repairFit", c."repairFitReasons",
  c."matchState", c."matchReasons", c."matchProspectId", c."duplicateOfCandidateId", c."qualityFlags", c."sourceConfidence", c."datasets", c."lastSeenRelease", c."reviewState", c."importState"`;

async function sample() {
  const province = arg("province", "AB")!, seed = arg("seed", `c2-${province}-1`)!;
  const data = await withReadOnly(async (c) => {
    const draw = async (where: string, n: number) => (await c.query(`SELECT ${COLS} FROM "garageos"."CrmDiscoveryCandidate" c WHERE c."province" = $1 AND ${where} ORDER BY md5(c."sourceRecordId" || $2) LIMIT ${n}`, [province, seed])).rows;
    const strata: Record<Stratum, any[]> = {
      VERIFIED_REPAIR: await draw(`c."duplicateOfCandidateId" IS NULL AND c."repairFit" = 'VERIFIED_REPAIR'`, SIZES.VERIFIED_REPAIR),
      EXCLUDED: await draw(`c."duplicateOfCandidateId" IS NULL AND c."repairFit" = 'EXCLUDED'`, SIZES.EXCLUDED),
      HUMAN_REVIEW: await draw(`c."duplicateOfCandidateId" IS NULL AND c."repairFit" = 'HUMAN_REVIEW'`, SIZES.HUMAN_REVIEW),
      MATCHES: await draw(`(c."duplicateOfCandidateId" IS NOT NULL OR c."matchState" <> 'NEW')`, SIZES.MATCHES),
    };
    const counts = (await c.query(`SELECT count(*) FILTER (WHERE "duplicateOfCandidateId" IS NULL) staged, count(*) FILTER (WHERE "duplicateOfCandidateId" IS NULL AND "repairFit" = 'VERIFIED_REPAIR') verified, count(*) FILTER (WHERE "duplicateOfCandidateId" IS NULL AND "repairFit" = 'EXCLUDED') excluded, count(*) FILTER (WHERE "duplicateOfCandidateId" IS NULL AND "repairFit" = 'HUMAN_REVIEW') review, count(*) FILTER (WHERE "duplicateOfCandidateId" IS NOT NULL OR "matchState" <> 'NEW') matches FROM "garageos"."CrmDiscoveryCandidate" WHERE "province" = $1`, [province])).rows[0];
    // Matched / original records (business name, city, website domain only; owner and DNC as booleans).
    const pids = [...new Set(strata.MATCHES.map((r) => r.matchProspectId).filter(Boolean))], dids = [...new Set(strata.MATCHES.map((r) => r.duplicateOfCandidateId).filter(Boolean))];
    const prospects = pids.length ? (await c.query(`SELECT "id","name","city","province","address","websiteDomain",("assignedStaffId" IS NOT NULL) AS owned,"doNotContact" FROM "garageos"."CrmProspect" WHERE "id" = ANY($1)`, [pids])).rows : [];
    const originals = dids.length ? (await c.query(`SELECT "id","name","city","address","website" FROM "garageos"."CrmDiscoveryCandidate" WHERE "id" = ANY($1)`, [dids])).rows : [];
    return { strata, counts, prospects: new Map(prospects.map((p: any) => [p.id, p])), originals: new Map(originals.map((p: any) => [p.id, p])) };
  });
  const shape = (r: any, stratum: Stratum) => {
    const fit = assessRepairFit({ name: r.name, taxonomyPrimary: r.taxonomyPrimary, classReasons: r.classReasons });
    const dom = websiteDomain(r.website);
    const m = r.matchProspectId ? data.prospects.get(r.matchProspectId) : null, d = r.duplicateOfCandidateId ? data.originals.get(r.duplicateOfCandidateId) : null;
    return {
      id: r.id, sourceRecordId: r.sourceRecordId, stratum, name: r.name, category: r.taxonomyPrimary, tier: r.tier, address: [r.address, r.city, r.province, r.postalCode].filter(Boolean).join(", "), website: r.website,
      websiteDomain: dom, websiteDomainIsShared: dom ? isSharedIdentityDomain(dom) : false, bannerName: isBannerName(String(r.name).toLowerCase()),
      evidence: { storedFit: r.repairFit, storedReasons: r.repairFitReasons, currentFit: fit.fit, currentReasons: fit.reasons, classReasons: r.classReasons, chainSignal: r.chainSignal, qualityFlags: r.qualityFlags, sourceConfidence: r.sourceConfidence, datasets: r.datasets, commercialSegment: commercialSegment({ name: r.name, taxonomyPrimary: r.taxonomyPrimary }).segment },
      review: { reviewState: r.reviewState, importState: r.importState, release: r.lastSeenRelease },
      match: r.matchState === "NEW" && !d ? null : { state: r.matchState, reasons: r.matchReasons, crmRecord: m ? { name: m.name, city: m.city, province: m.province, address: m.address, websiteDomain: m.websiteDomain, owned: m.owned, doNotContact: m.doNotContact } : null, duplicateOf: d ? { name: d.name, city: d.city, address: d.address, website: d.website } : null },
      websiteChecked: false,
    };
  };
  const sampleOut = Object.fromEntries((Object.keys(SIZES) as Stratum[]).map((s) => [s, data.strata[s].map((r) => shape(r, s))])) as Record<Stratum, ReturnType<typeof shape>[]>;
  mkdirSync(out, { recursive: true });
  const meta = { province, seed, drawnAt: new Date().toISOString(), populations: data.counts, sizes: SIZES, method: "ORDER BY md5(sourceRecordId || seed) within each stratum (the stable Overture id, so the same seed gives the same sample in any environment holding the same release), duplicates excluded from the three fit strata", websitesFetched: false };
  writeFileSync(path.join(out, "audit-sample.json"), JSON.stringify({ meta, ...sampleOut }, null, 2));
  writeFileSync(path.join(out, "audit-labels.template.json"), JSON.stringify(Object.fromEntries(Object.values(sampleOut).flat().map((r) => [r.id, { bucket: null, note: "", websiteChecked: false }])), null, 2));
  const md = [`# C2 audit sample — ${province} (seed \`${seed}\`)`, "", `Populations: ${JSON.stringify(data.counts)}. No website was fetched by this tool.`, ""];
  for (const s of Object.keys(SIZES) as Stratum[]) {
    md.push(`## ${s} (${sampleOut[s].length})`, "", "| # | Name | Category | Address | Website | Evidence | Match | Conclusion |", "|---|---|---|---|---|---|---|---|");
    sampleOut[s].forEach((r, i) => md.push(`| ${i + 1} | ${r.name} | ${r.category ?? ""} | ${r.address} | ${r.website ?? ""} | ${r.evidence.storedFit ?? "—"}: ${(r.evidence.storedReasons ?? []).join(", ")}${r.evidence.commercialSegment === "HEAVY_DUTY" ? " · HEAVY_DUTY" : ""} | ${r.match ? `${r.match.state} ${(r.match.reasons ?? []).join(",")} ${r.match.crmRecord ? `→ ${r.match.crmRecord.name} (${r.match.crmRecord.city}, ${r.match.crmRecord.websiteDomain ?? "no site"})` : ""}${r.match.duplicateOf ? `dup of ${r.match.duplicateOf.name} (${r.match.duplicateOf.city})` : ""}` : ""} |  |`));
    md.push("");
  }
  writeFileSync(path.join(out, "audit-sample.md"), md.join("\n"));
  console.log(`sample written to ${out} (${Object.entries(sampleOut).map(([k, v]) => `${k}=${v.length}`).join(", ")})`);
}

async function impact() {
  const province = arg("province", "AB")!;
  const res = await withReadOnly(async (c) => {
    const q = async (sql: string, p: unknown[] = [province]) => (await c.query(sql, p)).rows;
    const byState = await q(`SELECT "matchState"::text AS state, "importState"::text AS import, count(*)::int AS n FROM "garageos"."CrmDiscoveryCandidate" WHERE "province" = $1 AND "duplicateOfCandidateId" IS NULL GROUP BY 1,2 ORDER BY 1,2`);
    const topDomains = await q(`SELECT lower(regexp_replace(regexp_replace(c."website", '^https?://(www\\.)?', ''), '[/?#].*$', '')) AS domain, count(*)::int AS n FROM "garageos"."CrmDiscoveryCandidate" c WHERE c."province" = $1 AND c."matchState" IN ('BRANCH_OF_EXISTING','AMBIGUOUS','EXISTING_STRONG') AND c."website" IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 30`);
    const candidatesWithMatch = await q(`SELECT c."id", c."name", c."matchState"::text AS state, c."matchReasons", c."importState"::text AS import, c."website", p."name" AS crm_name, p."city" AS crm_city, p."websiteDomain" AS crm_domain, ("p"."assignedStaffId" IS NOT NULL) AS crm_owned, p."doNotContact" AS crm_dnc
      FROM "garageos"."CrmDiscoveryCandidate" c JOIN "garageos"."CrmProspect" p ON p."id" = c."matchProspectId" WHERE c."province" = $1 AND c."matchState" <> 'NEW' ORDER BY c."id" LIMIT 2000`);
    // Already LINKED through the unknown-address paths: the only automatic link routes that relied on a "unique" phone or domain.
    const linked = await q(`SELECT c."id", c."name", c."city", c."province", c."matchReasons", c."importedProspectId", p."name" AS crm_name, p."city" AS crm_city, ("p"."assignedStaffId" IS NOT NULL) AS crm_owned, p."doNotContact" AS crm_dnc
      FROM "garageos"."CrmDiscoveryCandidate" c JOIN "garageos"."CrmProspect" p ON p."id" = c."importedProspectId" WHERE c."importState" = 'LINKED' AND (c."matchReasons" && ARRAY['NAME_CITY_PHONE','NAME_CITY_DOMAIN']) ORDER BY c."province", c."id" LIMIT 2000`, []);
    return { byState, topDomains, candidatesWithMatch, linked };
  });
  const flagged = res.candidatesWithMatch.filter((r: any) => (websiteDomain(r.website) && isSharedIdentityDomain(websiteDomain(r.website))) || isBannerName(String(r.name).toLowerCase()) || (r.crm_domain && isSharedIdentityDomain(r.crm_domain)));
  mkdirSync(out, { recursive: true });
  const report = { province, byMatchState: res.byState, topSharedDomainsAmongMatches: res.topDomains, candidatesWithAMatch: res.candidatesWithMatch.length, matchesInvolvingASharedDomainOrBannerName: flagged.length, alreadyLinkedThroughUnknownAddressPaths: res.linked, flaggedCandidates: flagged };
  writeFileSync(path.join(out, "matching-impact.json"), JSON.stringify(report, null, 2));
  console.log(`candidates with a CRM match: ${res.candidatesWithMatch.length}; involving a shared domain or banner name: ${flagged.length}; already LINKED via NAME_CITY_PHONE/DOMAIN (all provinces): ${res.linked.length} → ${path.join(out, "matching-impact.json")}`);
}

function score() {
  const s = JSON.parse(readFileSync(arg("sample")!, "utf8"));
  const labels = JSON.parse(readFileSync(arg("labels")!, "utf8")) as Record<string, AuditLabel>;
  const clean = Object.fromEntries(Object.entries(labels).filter(([, l]) => l && l.bucket));
  const r = scoreAudit({ VERIFIED_REPAIR: s.VERIFIED_REPAIR, EXCLUDED: s.EXCLUDED, HUMAN_REVIEW: s.HUMAN_REVIEW, MATCHES: s.MATCHES }, clean);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "audit-score.json"), JSON.stringify({ thresholds: C2_THRESHOLDS, ...r }, null, 2));
  console.log(JSON.stringify({ verified: r.verified, excluded: r.excluded, matches: r.matches, verdicts: r.verdicts, unlabelled: r.unlabelled, websitesChecked: r.websitesChecked }, null, 2));
}

(async () => {
  if (mode === "sample") await sample(); else if (mode === "impact") await impact(); else if (mode === "score") score();
  else { console.error("usage: c2-audit.ts sample|impact|score [--province AB] [--seed s] [--out dir] [--sample f --labels f]"); process.exit(2); }
})().catch((e) => { console.error(e instanceof Error ? e.message : "failed"); process.exit(1); });
