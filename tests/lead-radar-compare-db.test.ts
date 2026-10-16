/* eslint-disable @typescript-eslint/no-explicit-any */
// V1 vs V2 comparison against a REAL PostgreSQL scratch database: the report is read-only, matches what the executor later does, and the standalone production
// script is a read-only transaction. Synthetic records only. Skipped unless GARAGEOS_CRM_TEST_DB_URL is a LOCAL scratch database (same rule as the other DB suites).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Lead Radar compare database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const radar = await import("../src/actions/lead-radar");
  const auto = await import("../src/actions/lead-radar-automation");
  const policyLib = await import("../src/lib/lead-radar/policy");
  const qualifyLib = await import("../src/lib/lead-radar/qualify");
  const compareLib = await import("../src/lib/lead-radar/compare");
  const rules = await import("../src/domain/lead-radar/policy-rules");

  const run = Date.now().toString(36);
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  let rootId = "";
  const HIER = ["travel_and_transportation", "vehicle_service"];
  const phone = (n: number) => `+1514${String(Date.now() % 100000).padStart(5, "0")}${String(n).padStart(2, "0")}`.slice(0, 12);
  const SRC2 = [{ dataset: "meta", license: "CDLA-Permissive-2.0" }, { dataset: "foursquare", license: "Apache-2.0" }];
  const SRC1 = [{ dataset: "meta", license: "CDLA-Permissive-2.0" }];
  let n = 0;
  const rec = (name: string, primary: string, o: Record<string, unknown> = {}) => {
    n++;
    return {
      v: 1, id: `00000000-0000-4000-8000-${run.padStart(6, "0")}${String(n).padStart(6, "0")}`, confidence: 0.9, name,
      taxonomy: { primary, hierarchy: HIER, alternates: null },
      address: { freeform: `${100 + n} Rue ${name.split(" ").pop()}`, locality: "Québec", postcode: "G1R 4S9", region: "QC", country: "CA" },
      phones: [phone(n)], websites: [`https://c-${run}-${n}.example.ca/`], emails: [], sources: SRC2, ...o,
    };
  };
  const POP = [
    rec("Mécanique Aurore", "automotive_repair"), rec("Garage Bison", "automotive_repair"), rec("Freins Cèdre", "brake_service_and_repair"),
    rec("Carrosserie Dune", "auto_body_shop"), rec("Carrosserie Érable", "auto_body_shop"), rec("Vitres Falaise", "auto_glass_service"), rec("Restauration Grenat", "auto_restoration_service"),
    rec("Pièces Hibou", "auto_parts_store"), rec("Pièces Ivoire", "auto_parts_store"), rec("Lavage Jonquille", "car_wash"), rec("Remorquage Karma", "towing_service"),
    rec("Concession Lynx", "auto_dealer"),
    rec("Garage Mistral", "automotive_service"), rec("Mécanique Nacre", "automotive_service"), rec("Opale Auto", "automotive_service"),
    rec("Pneus Pivoine", "tire_shop", { confidence: 0.3 }), rec("Pneus Quartz", "tire_shop", { confidence: 0.3 }), rec("Pneus Rubis", "tire_shop", { confidence: 0.3, sources: SRC1 }),
    rec("Midas Saphir", "automotive_repair"), rec("Garage Topaze", "automotive_repair", { sources: [{ dataset: "OpenStreetMap", license: "ODbL-1.0" }] }),
  ];
  const as1 = async () => { as(rootId); const r: any = await auto.compareLeadPolicies({ a: { preset: "V1" }, b: { preset: "V2" }, includeNames: true }); assert.equal(r.ok, true, JSON.stringify(r)); return r; };
  const snapshot = async () => JSON.stringify({
    cands: await db.crmDiscoveryCandidate.findMany({ orderBy: { id: "asc" } }), policies: await db.crmLeadPolicy.count(), audit: await db.crmAuditEvent.count(), runs: await db.crmLeadAutomationRun.count(),
    prospects: await db.crmProspect.count(), enroll: await db.crmSequenceEnrollment.count(), msgs: await db.crmEmailMessage.count(), automation: await db.crmLeadAutomation.findUnique({ where: { id: "default" } }),
  });

  test("setup: stage a synthetic, mixed population through the real pipeline (no policy active, automation off)", async () => {
    rootId = (await db.user.create({ data: { name: "Root", email: `root-${run}@garage-os.ca`, role: "SUPER_ADMIN" } })).id;
    process.env.LEAD_RADAR_ENABLED = "1"; as(rootId);
    assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: false })) as any).ok, true);
    const created: any = await radar.createDiscoveryRun({ scope: { provinces: ["QC"], groups: ["REPAIR", "BODY_GLASS", "DEALER", "PARTS", "OTHER_AUTOMOTIVE"] }, release: "2026-09-23.1" });
    const r = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: created.runId } });
    assert.equal(((await radar.attachDiscoveryManifest(created.runId, JSON.stringify({ extractor: "t", extractorVersion: "1", planHash: r.planHash, release: "2026-09-23.1", recordCount: POP.length, fileSha256: "a".repeat(64), generatedAt: new Date().toISOString(), stats: {} }))) as any).ok, true);
    assert.equal(((await radar.ingestDiscoveryChunk(created.runId, 0, POP.map((x) => JSON.stringify(x)).join("\n"))) as any).ok, true);
    assert.equal(((await radar.completeDiscoveryRun(created.runId)) as any).ok, true);
    assert.equal(await db.crmDiscoveryCandidate.count(), POP.length);
  });

  test("authorization: only the Super Admin can run a comparison (server-side)", async () => {
    const rep = await db.user.create({ data: { name: "Rep", email: `rep-${run}@garage-os.ca`, role: "VIEWER" } });
    await db.platformSalesStaff.create({ data: { userId: rep.id, role: "SALES_REP", status: "ACTIVE" } });
    const tenant = await db.user.create({ data: { name: "T", email: `t-${run}@shop.test`, role: "OWNER" } });
    for (const who of [rep.id, tenant.id, null]) { as(who); await assert.rejects(auto.compareLeadPolicies({ a: { preset: "V1" }, b: { preset: "V2" } }), /SALES_FORBIDDEN/); }
  });

  test("comparison over real staged rows: V1 vs V2 distribution, movements with reasons, invariants hold — and it changes NOTHING (candidates, policies, audit, runs, prospects, enrollments, messages, automation row)", async () => {
    const before = await snapshot();
    const r = await as1();
    const rep = r.report;
    assert.equal(rep.evaluated, POP.length);
    // V1: only clean primaries are auto; V2 adds repair-capable specialties, name-evidence generics and corroborated low confidence.
    // V1: only the 3 clean primaries are auto (the corroborated low-confidence tires, body/glass/restoration and generic shops all wait for a human).
    assert.deepEqual([rep.a.lanes.AUTO_ELIGIBLE, rep.a.lanes.BLOCKED], [3, 1], JSON.stringify(rep.a.lanes));
    // V2: + body×2, glass, restoration, 2 generic shops with name evidence, 2 corroborated tire shops = 11 auto; 5 blocked (OSM licence + parts×2, wash, towing);
    // 4 stay with a human (chain, dealer, generic without evidence, low confidence with a single source).
    assert.deepEqual([rep.b.lanes.AUTO_ELIGIBLE, rep.b.lanes.HUMAN_REVIEW, rep.b.lanes.BLOCKED], [11, 4, 5], JSON.stringify(rep.b.lanes));
    assert.equal(rep.invariants.ok, true);
    const kinds = Object.fromEntries(rep.movements.map((m: any) => [m.cause, m.count]));
    assert.ok(Object.keys(kinds).some((k) => /NOT_TARGET_BUSINESS/.test(k)));
    assert.ok(rep.movements.flatMap((m: any) => m.examples).some((e: any) => /Carrosserie|Vitres|Restauration/.test(e.name ?? "")), "real example rows appear when names are requested");
    const dealer = rep.byBusinessType.DEALER; assert.equal(dealer.b.HUMAN_REVIEW, 1);
    assert.ok(r.markdown.includes("Nothing was imported, assigned, contacted or modified"));
    assert.equal(await snapshot(), before, "analysis is strictly read-only");
    // names are off unless asked
    as(rootId);
    const quiet: any = await auto.compareLeadPolicies({ a: { preset: "V1" }, b: { preset: "V2" } });
    assert.ok(quiet.report.movements.flatMap((m: any) => m.examples).every((e: any) => e.name === undefined));
    assert.equal(await snapshot(), before);
  });

  test("preview ≡ execution: activating the V2 policy and letting the executor run produces exactly the lanes the comparison predicted; V1 was never replaced silently", async () => {
    const predicted = (await compareLib.compareRulesOnPool(rules.DEFAULT_POLICY_RULES, rules.RECOMMENDED_V2_RULES)).report.b.lanes;
    as(rootId);
    const c: any = await auto.createLeadPolicy({ name: "Recommended V2", rules: rules.RECOMMENDED_V2_RULES });
    assert.equal(c.ok, true, JSON.stringify(c));
    assert.equal(((await auto.activateLeadPolicy(c.policyId)) as any).error, "POLICY_NOT_PREVIEWED");
    assert.equal(((await auto.previewLeadPolicy(c.policyId)) as any).ok, true);
    assert.equal(((await auto.activateLeadPolicy(c.policyId)) as any).ok, true);
    const pol = (await policyLib.getActivePolicy())!;
    await qualifyLib.qualifyPending(pol, { deadline: Date.now() + 60_000 });
    const lane = (l: string) => db.crmDiscoveryCandidate.count({ where: { qualificationLane: l as any, qualificationPolicyVersion: pol.version } });
    assert.deepEqual({ a: await lane("AUTO_ELIGIBLE"), h: await lane("HUMAN_REVIEW"), b: await lane("BLOCKED") }, { a: predicted.AUTO_ELIGIBLE, h: predicted.HUMAN_REVIEW, b: predicted.BLOCKED });
    assert.equal(await db.crmProspect.count(), 0, "qualifying imports nothing");
    // The stored V2 rules keep their hash (V1 rules hash untouched), and V1-vs-active comparison now reports zero movement for itself.
    assert.equal(pol.rulesHash, (await import("../src/domain/lead-radar/qualification-hash")).rulesHashOf(rules.RECOMMENDED_V2_RULES));
  });

  test("production report script: ONE read-only transaction (writes are rejected by the database), SELECT-only, counts match the product, names only on request, no contact data in the output", async () => {
    const env = { ...process.env, DATABASE_URL: URL_!, DIRECT_URL: URL_! } as NodeJS.ProcessEnv;
    const run_ = (args: string[]) => spawnSync("npx", ["tsx", "scripts/lead-radar/policy-report.ts", ...args], { env, cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8", timeout: 120_000 });
    const self = run_(["--selftest-readonly"]);
    assert.match(self.stdout, /READ_ONLY_ENFORCED \(25006\)/, self.stdout + self.stderr);
    assert.equal(await db.crmLeadAutomationRun.count({ where: { id: "selftest" } }), 0);
    const before = await snapshot();
    const out = mkdtempSync(path.join(tmpdir(), "lr-report-"));
    const r = run_(["--out", out, "--a", "v1", "--b", "v2"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(!r.stdout.includes(URL_!) && !r.stderr.includes(URL_!), "the connection string is never printed");
    const json = JSON.parse(readFileSync(path.join(out, "report.json"), "utf8"));
    const lib = (await compareLib.compareRulesOnPool(rules.DEFAULT_POLICY_RULES, rules.RECOMMENDED_V2_RULES)).report;
    assert.deepEqual([json.report.a.lanes, json.report.b.lanes], [lib.a.lanes, lib.b.lanes], "script and product agree on the same rows");
    const md = readFileSync(path.join(out, "report.md"), "utf8");
    assert.match(md, /Read-only comparison/);
    assert.ok(!/Carrosserie Dune/.test(md) && !/Carrosserie Dune/.test(JSON.stringify(json)), "no business names unless requested");
    const withNames = mkdtempSync(path.join(tmpdir(), "lr-report-"));
    const r2 = run_(["--out", withNames, "--examples", "3", "--include-names", "--a", "v1", "--b", "v2"]);
    assert.equal(r2.status, 0, r2.stdout + r2.stderr);
    const md2 = readFileSync(path.join(withNames, "report.md"), "utf8");
    assert.ok(/Carrosserie|Vitres|Restauration|Pièces|Lavage|Remorquage/.test(md2));
    assert.ok(!/@|\+1514/.test(md2), "no email or phone in the report");
    assert.equal(await snapshot(), before, "running the script changed nothing");
    // a stored policy can be a side
    const r3 = run_(["--out", out, "--a", "policy:1", "--b", "v2"]);
    assert.equal(r3.status, 0, r3.stdout + r3.stderr);
    assert.notEqual(run_(["--out", out, "--a", "policy:9999"]).status, 0);
  });
}
