// Guard for docs/operations/remote-pilot-readonly.sql — the operator runs it against PRODUCTION, so it must stay strictly read-only
// and must never name a column that holds a personal address, phone number or contact name.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../docs/operations/remote-pilot-readonly.sql", import.meta.url), "utf8");
const code = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const statements = code.split(";").map((s) => s.trim()).filter(Boolean);
const count = (re: RegExp) => statements.filter((s) => re.test(s)).length;

test("remote pilot SQL: every statement is a SELECT/WITH inside BEGIN READ ONLY … ROLLBACK, nothing else", () => {
  assert.ok(statements.length > 0);
  for (const s of statements) assert.match(s, /^(BEGIN READ ONLY|ROLLBACK|SELECT\b|WITH\b)/i, s.slice(0, 60));
  assert.equal(count(/^BEGIN READ ONLY/i), count(/^ROLLBACK/i));
  assert.ok(count(/^BEGIN READ ONLY/i) >= 8, "eight self-contained blocks");
  assert.doesNotMatch(code, /\b(insert\s+into|update\s+\S+\s+set|delete\s+from|drop\s|alter\s|truncate\s|create\s|grant\s|revoke\s|copy\s|vacuum\b|commit\b|lock\s+table|merge\s+into)/i);
});

test("remote pilot SQL: never names a column holding a personal address, phone number or contact name", () => {
  for (const col of ['"email"', '"phone"', '"fromEmail"', '"contactEmail"', '"contactPhone"', 'c.name', 'c."name"']) assert.ok(!code.includes(col), `forbidden column ${col}`);
});
