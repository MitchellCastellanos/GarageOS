// Refuses (exit 1) unless GARAGEOS_CRM_TEST_DB_URL is a local, disposable test database.
// Usage: node scripts/ci/assert-scratch-db.mjs        (reads GARAGEOS_CRM_TEST_DB_URL; never prints the password)
import { checkScratchUrl } from "../lib/scratch-db-guard.mjs";

const r = checkScratchUrl(process.env.GARAGEOS_CRM_TEST_DB_URL);
if (!r.ok) {
  console.error(`[assert-scratch-db] REFUSING to run database suites: ${r.reason}`);
  process.exit(1);
}
console.log(`[assert-scratch-db] ok: ${r.url.hostname}:${r.url.port || "5432"}/${r.database}`);
