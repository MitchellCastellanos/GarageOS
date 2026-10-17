// Guard for docs/operations/contact-discovery-readonly.sql — run against PRODUCTION: strictly read-only, one JSON object, no personal columns selected.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../docs/operations/contact-discovery-readonly.sql", import.meta.url), "utf8");
const code = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const statements = code.split(";").map((s) => s.trim()).filter(Boolean);

test("contact discovery SQL: BEGIN READ ONLY, one SELECT/WITH, ROLLBACK, nothing else", () => {
  assert.equal(statements.length, 3);
  assert.match(statements[0], /^BEGIN READ ONLY/i);
  assert.match(statements[1], /^WITH\b/i);
  assert.match(statements[2], /^ROLLBACK/i);
  assert.doesNotMatch(code, /\b(insert\s+into|update\s+\S+\s+set|delete\s+from|drop\s|alter\s|truncate\s|create\s|grant\s|revoke\s|copy\s|vacuum\b|commit\b|lock\s+table|merge\s+into)/i);
});

test("contact discovery SQL: no personal column is ever selected (addresses are only matched against the syntax pattern or compared inside EXISTS)", () => {
  for (const col of ['"phone"', '"fromEmail"', '"contactEmail"', '"contactPhone"', 'c.name', 'c."name"', 'p."name"', 'p."phone"']) assert.ok(!code.includes(col), `forbidden column ${col}`);
  const finalSelect = code.slice(code.lastIndexOf("SELECT jsonb_build_object"));
  assert.doesNotMatch(finalSelect, /"email"|emailNormalized/);
});
