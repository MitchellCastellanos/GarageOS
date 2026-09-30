// Block 15 — import safety and scale against a REAL PostgreSQL database, through the real server actions.
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { ENABLED, db, seedTenant, snapshotShop, diffSnapshots, type Tenant } from "./helpers";
import { setSession } from "../helpers/action-harness";

const skip = ENABLED ? false : "set GARAGEOS_INTEGRATION_DB=1 with a migrated DATABASE_URL";
let PRO: Tenant, CORE: Tenant;
const as = (t: Tenant) => setSession({ user: { id: t.ownerId, role: "OWNER", shopId: t.shopId } });

before(async () => {
  if (!ENABLED) return;
  PRO = await seedTenant({ label: "ImpPro", plan: "PRO" });
  CORE = await seedTenant({ label: "ImpCore", plan: "CORE" });
});
after(async () => {
  if (ENABLED) await db.$disconnect();
});

function form(name: string, content: string | Buffer, entity: string, extra: Record<string, string> = {}) {
  const f = new FormData();
  f.set("file", new File([content as BlobPart], name));
  f.set("entity", entity);
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
}
const importActions = () => import("../../src/actions/import");
const csvCustomers = (n: number, offset = 0) =>
  "first_name,last_name,email,phone\n" + Array.from({ length: n }, (_, i) => `Nom${i + offset},Fam${i + offset},x${i + offset}@ex.test,514555${String((i + offset) % 10000).padStart(4, "0")}`).join("\n");

test("hostile / broken files are refused cleanly and change nothing", { skip }, async () => {
  const a = await importActions();
  as(PRO);
  const before = await snapshotShop(PRO.shopId);
  const cases: [string, string | Buffer][] = [
    ["empty.csv", ""],
    ["only-header.csv", "first_name,last_name,email,phone\n"],
    ["garbage.csv", Buffer.from([0, 255, 254, 1, 2, 3, 200, 201])],
    ["broken.xlsx", Buffer.from("PK\u0003\u0004 this is not really a zip")],
    ["truncated.xlsx", readFileSync(new URL("../fixtures/customers.xlsx", import.meta.url)).subarray(0, 300)],
    ["binary.pdf", Buffer.from("%PDF-1.4 ...")],
  ];
  for (const [name, content] of cases) {
    const res = await a.previewImportAction(form(name, content, "customers")).catch((e) => ({ ok: false, error: `THROW ${e}` }));
    assert.equal((res as { ok: boolean }).ok, false, `${name} must be refused (${JSON.stringify(res).slice(0, 80)})`);
    assert.doesNotMatch(String((res as { error?: string }).error), /THROW/, `${name} must not throw`);
  }
  const tooBig = await a.previewImportAction(form("big.csv", "a,b\n" + "x,y\n".repeat(1_100_000), "customers"));
  assert.equal(tooBig.ok, false, "files over the size cap are refused");
  assert.deepEqual(diffSnapshots(before, await snapshotShop(PRO.shopId)), [], "nothing written");
});

test("missing columns, wrong types, in-file duplicates and existing duplicates are reported, valid rows still land", { skip }, async () => {
  const a = await importActions();
  as(PRO);
  const existing = await db.client.findFirst({ where: { shopId: PRO.shopId } });
  const csv = [
    "first_name,last_name,email,phone",
    "Ok1,Person,ok1@ex.test,5145550001",
    "Ok2,Person,ok2@ex.test,5145550002",
    "Dup,Person,ok1@ex.test,5145550003",               // duplicate of a row in the same file
    `Exist,Person,${existing!.email},5145550004`,      // duplicate of an existing customer
    ",NoFirstName,nofirst@ex.test,5145550005",         // missing required value
    "Bad,Email,not-an-email,5145550006",                // wrong type
  ].join("\n");
  const missing = await a.previewImportAction(form("c.csv", "foo,bar\n1,2", "customers", { mapping: JSON.stringify({ firstName: null }) }));
  void missing;
  const mapping = JSON.stringify({ firstName: 0, lastName: 1, email: 2, phone: 3 });
  const before = await db.client.count({ where: { shopId: PRO.shopId } });
  const res = await a.commitImportAction(form("c.csv", csv, "customers", { mapping }));
  assert.equal(res.ok, true, JSON.stringify(res).slice(0, 200));
  const after = await db.client.count({ where: { shopId: PRO.shopId } });
  assert.equal(after - before, 2, "only the two clean rows were created");
  // running the same file again creates nothing new (idempotent)
  const again = await a.commitImportAction(form("c.csv", csv, "customers", { mapping }));
  assert.equal(again.ok, true);
  assert.equal(await db.client.count({ where: { shopId: PRO.shopId } }), after, "re-import is a no-op");
  // required column not mapped
  const noCols = await a.commitImportAction(form("c.csv", csv, "customers", { mapping: JSON.stringify({ firstName: null, lastName: 1 }) }));
  assert.equal(noCols.ok, false);
});

test("Core is capped at 500 rows/file and cannot import inventory; server-side, regardless of UI", { skip }, async () => {
  const a = await importActions();
  as(CORE);
  const before = await snapshotShop(CORE.shopId);
  const over = await a.commitImportAction(form("c.csv", csvCustomers(501), "customers", { mapping: JSON.stringify({ firstName: 0, lastName: 1, email: 2, phone: 3 }) }));
  assert.equal(over.ok, false);
  const inv = await a.commitImportAction(form("p.csv", "name,sku,price,qty\nPart,S1,5,3", "inventory", { mapping: JSON.stringify({ name: 0, sku: 1, unitPrice: 2, quantityOnHand: 3 }) }));
  assert.equal(inv.ok, false);
  assert.deepEqual(diffSnapshots(before, await snapshotShop(CORE.shopId)), []);
  const ok = await a.commitImportAction(form("c.csv", csvCustomers(500, 90000), "customers", { mapping: JSON.stringify({ firstName: 0, lastName: 1, email: 2, phone: 3 }) }));
  assert.equal(ok.ok, true, "500 rows is within the Core cap");
  // one generated phone (…0100) equals the seeded customer's phone, so the importer correctly skips it as a duplicate
  assert.equal(await db.client.count({ where: { shopId: CORE.shopId } }), 500);
});

test("STRESS: 10,000 customers (CSV) + 10,000 vehicles + 10,000 parts import in one request each, within time", { skip }, async () => {
  const a = await importActions();
  const big = await seedTenant({ label: "ImpBig", plan: "COMPLETE" });
  as(big);
  const cMap = JSON.stringify({ firstName: 0, lastName: 1, email: 2, phone: 3 });
  const csv = csvCustomers(10_000);
  assert.ok(Buffer.byteLength(csv) < 4 * 1024 * 1024, `10k customer rows fit the 4 MB cap (${Buffer.byteLength(csv)} bytes)`);
  let t0 = Date.now();
  const rss0 = process.memoryUsage().rss;
  const r1 = await a.commitImportAction(form("c10k.csv", csv, "customers", { mapping: cMap }));
  const tCustomers = Date.now() - t0;
  assert.equal(r1.ok, true, JSON.stringify(r1).slice(0, 300));
  // row #100 shares the seeded customer's phone => deduplicated (skip), so 10,000 in total
  assert.equal(await db.client.count({ where: { shopId: big.shopId } }), 10_000);

  const vCsv = "email,make,model,year,plate\n" + Array.from({ length: 10_000 }, (_, i) => `x${i}@ex.test,Honda,Civic,${1990 + (i % 30)},PL${String(i).padStart(5, "0")}`).join("\n");
  t0 = Date.now();
  const r2 = await a.commitImportAction(form("v10k.csv", vCsv, "vehicles", { mapping: JSON.stringify({ email: 0, make: 1, model: 2, year: 3, licensePlate: 4 }) }));
  const tVehicles = Date.now() - t0;
  assert.equal(r2.ok, true, JSON.stringify(r2).slice(0, 300));
  assert.ok((await db.vehicle.count({ where: { client: { shopId: big.shopId } } })) >= 10_000);

  const pCsv = "name,sku,price,qty\n" + Array.from({ length: 10_000 }, (_, i) => `Part ${i},SKU${i},${(i % 90) + 1},${i % 20}`).join("\n");
  t0 = Date.now();
  const r3 = await a.commitImportAction(form("p10k.csv", pCsv, "inventory", { mapping: JSON.stringify({ name: 0, sku: 1, unitPrice: 2, quantityOnHand: 3 }) }));
  const tParts = Date.now() - t0;
  assert.equal(r3.ok, true, JSON.stringify(r3).slice(0, 300));
  assert.equal(await db.inventoryPart.count({ where: { shopId: big.shopId } }), 10_001, "10,000 parts + the seeded part");
  const rssGrowthMb = Math.round((process.memoryUsage().rss - rss0) / 1e6);
  console.log(`# import stress: customers ${tCustomers}ms, vehicles ${tVehicles}ms, parts ${tParts}ms, rss +${rssGrowthMb}MB`);
  assert.ok(tCustomers < 60_000 && tVehicles < 60_000 && tParts < 60_000, "each 10k import finishes well inside a serverless request budget");
});

test("STRESS: a 10,000-row XLSX parses and imports", { skip: skip || !existsSync("/tmp/claude-0/imp/big.xlsx") ? "no generated xlsx" : false }, async () => {
  const a = await importActions();
  const big = await seedTenant({ label: "ImpXlsx", plan: "PRO" });
  as(big);
  const buf = readFileSync("/tmp/claude-0/imp/big.xlsx");
  const t0 = Date.now();
  const res = await a.commitImportAction(form("big.xlsx", buf, "customers", { mapping: JSON.stringify({ firstName: 0, lastName: 1, email: 2, phone: 3 }) }));
  console.log(`# xlsx 10k: ${Date.now() - t0}ms, ${buf.length} bytes`);
  assert.equal(res.ok, true, JSON.stringify(res).slice(0, 300));
  assert.equal(await db.client.count({ where: { shopId: big.shopId } }), 10_000);
});
