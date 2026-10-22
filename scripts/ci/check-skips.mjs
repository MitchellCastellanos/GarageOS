// Fails when a test run skipped something that CI is expected to execute.
// Usage: node scripts/ci/check-skips.mjs <test-output.log>
//
// `tsx --test` prints every skipped test as `ok N - <name> # SKIP`. In CI the only legitimate skips are the suites that need a
// real PostgreSQL (they say so in their name) — everything else, notably the rendered-HTML SEO suites ("run `next build` first"),
// must really run, otherwise a green check would hide a disabled guard.
import { readFileSync } from "node:fs";

const ALLOWED = [/GARAGEOS_CRM_TEST_DB_URL/, /GARAGEOS_INTEGRATION/, /database suite/i];

const lines = readFileSync(process.argv[2], "utf8").split("\n");
const skipped = lines.filter((l) => /^\s*ok \d+ - .*# SKIP/.test(l));
const unexpected = skipped.filter((l) => !ALLOWED.some((re) => re.test(l)));

console.log(`skipped tests: ${skipped.length} (database-gated: ${skipped.length - unexpected.length})`);
if (unexpected.length > 0) {
  console.error("Unexpected skips (CI must execute these):");
  for (const l of unexpected) console.error("  " + l.trim());
  process.exit(1);
}
