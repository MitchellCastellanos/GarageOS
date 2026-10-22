import assert from "node:assert/strict";
import test from "node:test";
import { checkScratchUrl, suiteDatabaseName } from "../scripts/lib/scratch-db-guard.mjs";

test("scratch guard accepts local test databases", () => {
  assert.equal(checkScratchUrl("postgresql://postgres:pw@127.0.0.1:5432/garageos_scratch_test").ok, true);
  assert.equal(checkScratchUrl("postgres://u@localhost/garageos_replay").ok, true);
});

test("scratch guard refuses remote hosts, non-test names, other protocols and junk", () => {
  const bad = [
    undefined,
    "",
    "not a url",
    "postgresql://u:p@ep-x.neon.tech/garageos_test",
    "postgresql://u:p@db.example.com:5432/garageos_test",
    "postgresql://u:p@10.0.0.5/garageos_test",
    "postgresql://u:p@[::1]:5432/garageos_test",
    "postgresql://u:p@127.0.0.1:5432/garageos",
    "postgresql://u:p@127.0.0.1:5432/neondb",
    "postgresql://u:p@127.0.0.1:5432/",
    "mysql://u:p@127.0.0.1:3306/garageos_test",
    "postgresql://u:p@127.0.0.1:5432/garageos_test?host=x.neon.tech",
  ];
  for (const u of bad) assert.equal(checkScratchUrl(u as string).ok, false, String(u));
});

test("scratch guard never echoes the password", () => {
  const r = checkScratchUrl("postgresql://u:topsecret@db.example.com/garageos_test");
  assert.equal(r.ok, false);
  assert.ok(!JSON.stringify(r).includes("topsecret"));
});

test("per-suite database names keep the test pattern and fit PostgreSQL's 63-byte limit", () => {
  const n = suiteDatabaseName("garageos_scratch_test", "lead-radar-contact-seeding-db.test.ts");
  assert.equal(n, "garageos_scratch_test__lead_radar_contact_seeding_db");
  assert.ok(n.length <= 63);
  const long = suiteDatabaseName("garageos_scratch_test_with_a_long_name", "lead-radar-contact-seeding-db.test.ts");
  assert.ok(long.length <= 63);
  assert.equal(checkScratchUrl(`postgresql://u@127.0.0.1/${long}`).ok, true);
});
