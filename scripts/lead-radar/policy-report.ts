#!/usr/bin/env -S npx tsx
// READ-ONLY qualification-policy comparison against a real database (e.g. production), run from your own machine:
//
//   DATABASE_URL=<connection string> npx tsx scripts/lead-radar/policy-report.ts --out ./policy-report
//   ... --a v1 --b v2                 (default: V1 defaults vs the recommended V2)
//   ... --a policy:1 --b v2           (a stored policy version, read from CrmLeadPolicy)
//   ... --b ./my-rules.json           (rules from a JSON file)
//   ... --examples 5 --include-names  (business names/cities/categories only — never phones, emails or addresses; off by default)
//   ... --selftest-readonly           (proves the connection cannot write, then exits)
//
// Guarantees: the whole run is ONE `BEGIN READ ONLY` transaction (the database itself rejects any write), it issues SELECT statements only, it writes no row anywhere,
// it never prints the connection string, and its output contains counts and (optionally) business listing names — no contact data. Output: report.md + report.json.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { buildComparison, renderComparisonMarkdown, type CompareRow } from "../../src/domain/lead-radar/policy-compare";
import { canonicalRules, DEFAULT_POLICY_RULES, RECOMMENDED_V2_RULES, type PolicyRules } from "../../src/domain/lead-radar/policy-rules";

const arg = (name: string, def?: string) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] ?? "" : def; };
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) { console.error("Set DATABASE_URL (or DIRECT_URL). Nothing is read from anywhere else."); process.exit(2); }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    if (flag("selftest-readonly")) {
      try { await client.query(`INSERT INTO "garageos"."CrmLeadAutomationRun" ("id","trigger","startedAt") VALUES ('selftest','selftest',now())`); console.log("NOT READ ONLY — aborting"); process.exit(1); }
      catch (e) { console.log(`READ_ONLY_ENFORCED (${(e as { code?: string }).code ?? "error"})`); }
      await client.query("ROLLBACK");
      return;
    }
    const side = async (spec: string): Promise<{ rules: PolicyRules; label: string }> => {
      const s = spec.toLowerCase();
      if (s === "v1") return { rules: DEFAULT_POLICY_RULES, label: "V1 defaults" };
      if (s === "v2") return { rules: RECOMMENDED_V2_RULES, label: "Recommended V2" };
      if (s.startsWith("policy:")) {
        const v = Number(s.slice(7));
        const r = await client.query(`SELECT "rules","name" FROM "garageos"."CrmLeadPolicy" WHERE "version" = $1`, [v]);
        if (!r.rows[0]) throw new Error(`policy version ${v} not found`);
        return { rules: canonicalRules(r.rows[0].rules), label: `Policy v${v}` };
      }
      return { rules: canonicalRules(JSON.parse(readFileSync(spec, "utf8"))), label: path.basename(spec) };
    };
    const A = await side(arg("a", "v1")!), B = await side(arg("b", "v2")!);

    // Same pool definition as the product (staged, not imported, completed run, pending or policy-approved).
    const rows: CompareRow[] = [];
    let after = "";
    for (;;) {
      const r = await client.query(
        `SELECT c."id", c."tier", c."licenseOk", c."licenses", c."datasets", c."chainSignal", c."matchState", c."qualityFlags", c."province", c."address", c."postalCode", c."phone", c."website",
                c."territoryKey", c."reviewState", c."name", c."taxonomyPrimary", c."classReasons", c."city", c."sourceConfidence", c."qualificationReasons"
         FROM "garageos"."CrmDiscoveryCandidate" c JOIN "garageos"."CrmDiscoveryRun" r ON r."id" = c."lastRunId"
         WHERE c."importState" = 'NOT_IMPORTED' AND r."status" = 'COMPLETED' AND (c."reviewState" = 'PENDING' OR c."approvedByPolicyVersion" IS NOT NULL) AND c."id" > $1
         ORDER BY c."id" LIMIT 5000`, [after]);
      for (const x of r.rows) {
        rows.push({
          tier: x.tier, licenseOk: x.licenseOk, licenses: x.licenses, datasets: x.datasets, chainSignal: x.chainSignal, matchState: x.matchState, qualityFlags: x.qualityFlags, province: x.province,
          address: x.address, postalCode: x.postalCode, phone: x.phone, website: x.website, territoryKey: x.territoryKey, reviewState: x.reviewState, name: x.name, taxonomyPrimary: x.taxonomyPrimary,
          classReasons: x.classReasons, city: x.city, sourceConfidence: x.sourceConfidence,
          stickyReasons: x.reviewState === "PENDING" ? (x.qualificationReasons as string[]).filter((q) => q === "SOURCE_CHANGED") : [],
        });
      }
      if (r.rows.length < 5000) break;
      after = r.rows[r.rows.length - 1].id;
    }
    await client.query("ROLLBACK"); // nothing was written; ending the read-only transaction releases it

    const report = buildComparison(rows, A.rules, B.rules, { examplesPerGroup: Number(arg("examples", "0")), includeNames: flag("include-names") });
    const out = arg("out", "./policy-report")!;
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, "report.md"), renderComparisonMarkdown(report, { a: A.label, b: B.label }));
    writeFileSync(path.join(out, "report.json"), JSON.stringify({ a: A.label, b: B.label, aRules: A.rules, bRules: B.rules, report }, null, 2));
    console.log(`Evaluated ${report.evaluated} candidates (read-only).`);
    console.log(`${A.label}: auto ${report.a.lanes.AUTO_ELIGIBLE} · review ${report.a.lanes.HUMAN_REVIEW} · blocked ${report.a.lanes.BLOCKED}`);
    console.log(`${B.label}: auto ${report.b.lanes.AUTO_ELIGIBLE} · review ${report.b.lanes.HUMAN_REVIEW} · blocked ${report.b.lanes.BLOCKED}`);
    console.log(report.invariants.ok ? "Safety invariants: OK" : `Safety invariants VIOLATED: ${JSON.stringify(report.invariants.violations)}`);
    console.log(`Report written to ${path.join(out, "report.md")} and report.json`);
    if (!report.invariants.ok) process.exit(1);
  } finally {
    await client.end().catch(() => undefined);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : "failed"); process.exit(1); });
