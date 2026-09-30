import assert from "node:assert/strict";
import test from "node:test";
import { readSheet } from "read-excel-file/node";
import { parseImportFile } from "../src/lib/import-file";
import { IMPORT_LIMITS } from "../src/domain/import";
import { buildXlsx } from "./helpers/xlsx-fixture";

// The XLSX used by the 10,000-row import stress test is generated, not checked in. These tests prove the
// generator produces a real workbook that the application's own parser reads back exactly (no database needed).

test("generated xlsx round-trips through read-excel-file, keeping leading zeros and special characters", async () => {
  const rows = [
    ["first_name", "last_name", "email", "phone"],
    ["Élise", "O'Brien & <Sons>", "e@ex.test", "0145550100"],
    ["Zoé", 'Dupont "Jr"', "z@ex.test", "5145550101"],
  ];
  const data = (await readSheet(buildXlsx(rows))) as unknown[][];
  assert.deepEqual(data.map((r) => r.map(String)), rows);
});

test("10,000-row customer workbook parses through the application's import reader, under the file-size cap", async () => {
  const rows: string[][] = [["first_name", "last_name", "email", "phone"]];
  for (let i = 0; i < 10_000; i++) rows.push([`Nom${i}`, `Fam${i}`, `x${i}@ex.test`, `514555${String(i % 10000).padStart(4, "0")}`]);
  const buf = buildXlsx(rows);
  assert.ok(buf.length < IMPORT_LIMITS.maxFileBytes, `fixture is ${buf.length} bytes, cap is ${IMPORT_LIMITS.maxFileBytes}`);
  assert.equal(buf[0], 0x50); // "PK"
  assert.equal(buf[1], 0x4b);
  const table = await parseImportFile(buf, "big.xlsx");
  assert.deepEqual(table.headers, rows[0]);
  assert.equal(table.rows.length, 10_000);
  assert.deepEqual(table.rows[100], ["Nom100", "Fam100", "x100@ex.test", "5145550100"]);
  assert.deepEqual(table.rows[9_999], rows[10_000]);
});
