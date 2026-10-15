#!/usr/bin/env -S npx tsx
// Offline profile of an extracted records.ndjson (no database, no network): tiers, field coverage, licences, geography.
//   npx tsx scripts/lead-radar/profile.ts out/records.ndjson [QC,AB]
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { cityKey } from "../../src/domain/sales-crm/territory";
import { toCandidate } from "../../src/domain/lead-radar/record";

async function main() {
  const file = process.argv[2];
  if (!file) { console.error("usage: profile.ts <records.ndjson> [provinces]"); process.exit(2); }
  const provinces = (process.argv[3] ?? "").split(",").filter(Boolean);
  const rl = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  const rejected: Record<string, number> = {}, tiers: Record<string, number> = {}, byProv: Record<string, Record<string, number>> = {};
  const lic: Record<string, number> = {}, flags: Record<string, number> = {};
  let n = 0, staged = 0;
  const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };
  const seen = new Map<string, number>();
  for await (const line of rl) {
    if (!line.trim()) continue;
    n++;
    let obj: unknown;
    try { obj = JSON.parse(line); } catch { bump(rejected, "MALFORMED_JSON"); continue; }
    const r = toCandidate(obj, { provinces }, { cityKeyOf: cityKey });
    if (!r.ok) { bump(rejected, r.issue); continue; }
    staged++;
    const c = r.candidate;
    bump(tiers, c.tier);
    const p = (byProv[c.province ?? "??"] ??= { total: 0, primary: 0, name: 0, address: 0, postal: 0, phone: 0, website: 0, email: 0 });
    p.total++;
    if (c.tier === "PRIMARY") p.primary++;
    p.name++; if (c.address) p.address++; if (c.postalCode) p.postal++; if (c.phone) p.phone++; if (c.website) p.website++; if (c.email) p.email++;
    c.licenses.forEach((l) => bump(lic, l)); if (!c.licenseOk) bump(lic, "BLOCKED");
    c.qualityFlags.forEach((f) => bump(flags, f));
    const k = `${c.nameNormalized}|${c.postalCode ?? c.address ?? ""}`; seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dupes = [...seen.values()].filter((v) => v > 1).length;
  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");
  console.log(JSON.stringify({ lines: n, staged, rejected, tiers, licenses: lic, sameNameSamePlaceKeys: dupes, flags }, null, 1));
  for (const [prov, p] of Object.entries(byProv)) console.log(prov, `total=${p.total} primary=${p.primary} address=${pct(p.address, p.total)} postal=${pct(p.postal, p.total)} phone=${pct(p.phone, p.total)} website=${pct(p.website, p.total)} email=${pct(p.email, p.total)}`);
}
main();
