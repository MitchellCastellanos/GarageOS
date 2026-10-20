// Recomputes the derived phone readiness columns of CrmProspect (docs/phone-first-calling-policy.md). Resumable and idempotent.
//   DATABASE_URL=… npx tsx scripts/phone-first-refresh.ts                (dry run: counts only, writes nothing)
//   DATABASE_URL=… npx tsx scripts/phone-first-refresh.ts --apply        (writes the derived columns)
//   … --after <prospectId>   resume after the last printed checkpoint
// Touches only phoneE164/phoneKind/phoneSource/phoneSourceRef/phoneBusinessBasis/phoneEligibility(+Reasons)/phoneEvaluatedAt. Never email, CASL, assignment or ownership.
import { refreshPhoneEligibility } from "../src/lib/sales-crm/phone-readiness";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const afterIdx = args.indexOf("--after");
let after: string | null = afterIdx >= 0 ? args[afterIdx + 1] ?? null : null;

async function main() {
  const total = { examined: 0, changed: 0, byStatus: {} as Record<string, number> };
  for (;;) {
    const r = await refreshPhoneEligibility({ after, limit: 500, dryRun: !apply });
    total.examined += r.examined; total.changed += r.changed;
    for (const [k, v] of Object.entries(r.byStatus)) total.byStatus[k] = (total.byStatus[k] ?? 0) + v;
    console.log(`checkpoint after=${r.next ?? "END"} examined=${total.examined} ${apply ? "changed" : "would change"}=${total.changed}`);
    if (!r.next) break;
    after = r.next;
  }
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", ...total }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
