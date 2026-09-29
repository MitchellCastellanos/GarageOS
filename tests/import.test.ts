import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { readFileSync } from "node:fs";
import {
  ClientMatcher,
  autoMapColumns,
  missingRequiredFields,
  parseCsv,
  parseNumber,
  planCustomers,
  planInventory,
  planVehicles,
  splitFullName,
  summarize,
  type ImportOptions,
} from "../src/domain/import";
import { ImportFileError, parseImportFile } from "../src/lib/import-file";
import { buildImportPlan, checkImportRequest, executeImport, reportPlan } from "../src/lib/import-service";
import { db } from "../src/lib/db";

const OPTS: ImportOptions = { duplicates: "skip", createMissingCustomers: true, defaultLanguage: "FR" };
const UPDATE: ImportOptions = { ...OPTS, duplicates: "update" };

test("parseCsv: quotes, escaped quotes, embedded newlines, BOM and ; delimiter", () => {
  const rows = parseCsv('﻿a;b;c\r\n"x;1";"he said ""hi""";"line1\nline2"\r\n\r\n');
  assert.deepEqual(rows, [["a", "b", "c"], ["x;1", 'he said "hi"', "line1\nline2"]]);
});

test("parseNumber handles currency, thousands and decimal comma", () => {
  assert.equal(parseNumber("$1,234.50"), 1234.5);
  assert.equal(parseNumber("1.234,50"), 1234.5);
  assert.equal(parseNumber("12,50"), 12.5);
  assert.equal(parseNumber("1,250"), 1250);
  assert.equal(parseNumber("abc"), null);
});

test("autoMapColumns recognises English and French headers", () => {
  const m = autoMapColumns("customers", ["Prénom", "Nom de famille", "Courriel", "Téléphone", "Adresse"]);
  assert.deepEqual([m.firstName, m.lastName, m.email, m.phone, m.address], [0, 1, 2, 3, 4]);
  const v = autoMapColumns("vehicles", ["Client", "Email", "Plaque", "Marque", "Modèle", "Année", "NIV"]);
  assert.equal(v.fullName, 0);
  assert.equal(v.licensePlate, 2);
  assert.equal(v.vin, 6);
  assert.deepEqual(missingRequiredFields("vehicles", v), []);
  assert.deepEqual(missingRequiredFields("customers", autoMapColumns("customers", ["Email"])), ["firstName"]);
});

test("splitFullName", () => {
  assert.deepEqual(splitFullName("Marie Tremblay-Roy"), { firstName: "Marie", lastName: "Tremblay-Roy" });
  assert.deepEqual(splitFullName("Tremblay, Marie"), { firstName: "Marie", lastName: "Tremblay" });
  assert.deepEqual(splitFullName("Cher"), { firstName: "Cher", lastName: "" });
});

const custMap = autoMapColumns("customers", ["First name", "Last name", "Email", "Phone"]);

test("planCustomers: validation errors, existing duplicates, in-file duplicates", () => {
  const existing = [{ id: "c1", firstName: "Ann", lastName: "Lee", email: "ann@x.com", phone: "+15145550100" }];
  const rows = [
    ["Ann", "Lee", "ANN@x.com", ""], // dup of existing by email
    ["Bob", "Ray", "bob@x.com", "514-555-0111"], // create
    ["Bobby", "R", "bob@x.com", ""], // dup in file by email
    ["", "Nofirst", "n@x.com", ""], // error
    ["Cy", "Dee", "not-an-email", ""], // error
    ["Di", "Fox", "", "(438) 555-0199"], // create
    ["Ed", "Fox", "", "438.555.0199"], // dup in file by phone
    ["Fay", "Gray", "", "12"], // short phone error
  ];
  const plan = planCustomers(rows, custMap, existing, OPTS);
  assert.deepEqual(plan.map((p) => p.action), ["skip_duplicate", "create", "skip_duplicate", "error", "error", "create", "skip_duplicate", "error"]);
  assert.equal(plan[0].duplicateInFile, false);
  assert.equal(plan[2].duplicateInFile, true);
  assert.equal(plan[3].rowNumber, 5);
  assert.deepEqual(plan[3].errors.map((e) => e.code), ["FIRST_NAME_REQUIRED"]);
  assert.equal(plan[1].data?.phone, "+15145550111");
  assert.deepEqual(summarize(plan), { total: 8, create: 2, update: 0, skipped: 3, errors: 3, customersCreated: 0 });
});

test("planCustomers: update strategy updates existing records but never a same-file repeat", () => {
  const existing = [{ id: "c1", firstName: "Ann", lastName: "Lee", email: "ann@x.com", phone: null }];
  const plan = planCustomers(
    [["Ann", "Lee", "ann@x.com", "514-555-0100"], ["Ann", "Lee", "ann@x.com", "514-555-0100"]],
    custMap,
    existing,
    UPDATE
  );
  assert.deepEqual(plan.map((p) => p.action), ["update", "update"]);
});

test("planCustomers: same name but different email/phone are different people", () => {
  const plan = planCustomers([["Sam", "Lee", "a@x.com", ""], ["Sam", "Lee", "b@x.com", ""]], custMap, [], OPTS);
  assert.deepEqual(plan.map((p) => p.action), ["create", "create"]);
});

test("ClientMatcher matches by name only when the row has no email/phone", () => {
  const m = new ClientMatcher([{ id: "c1", firstName: "Ann", lastName: "Lee", email: "a@x.com", phone: null }]);
  assert.equal(m.find({ firstName: "ann", lastName: "LEE" }), "c1");
  assert.equal(m.find({ firstName: "ann", lastName: "LEE", email: "other@x.com" }), null);
});

const vehMap = autoMapColumns("vehicles", ["Customer", "Email", "Plate", "Make", "Model", "Year", "VIN"]);

test("planVehicles: creates missing owners once, dedupes plates and VINs, reports row errors", () => {
  const clients = [{ id: "c1", firstName: "Ann", lastName: "Lee", email: "ann@x.com", phone: null }];
  const vehicles = [{ id: "v1", clientId: "c1", licensePlate: "ABC 123", vin: null }];
  const rows = [
    ["Ann Lee", "ann@x.com", "abc-123", "Honda", "Civic", "2015", ""], // dup existing (normalised plate)
    ["Bob Ray", "bob@x.com", "XYZ1", "Ford", "F150", "2018", ""], // creates Bob + vehicle
    ["Bob Ray", "bob@x.com", "XYZ2", "Ford", "Ranger", "2020", ""], // same new Bob, no second owner
    ["Bob Ray", "bob@x.com", "XYZ2", "Ford", "Ranger", "2020", ""], // dup in file
    ["Zed", "", "Q1", "Kia", "Rio", "1850", ""], // bad year
    ["", "", "Q2", "Kia", "Rio", "2010", ""], // no customer
  ];
  const plan = planVehicles(rows, vehMap, clients, vehicles, OPTS);
  assert.deepEqual(plan.map((p) => p.action), ["skip_duplicate", "create", "create", "skip_duplicate", "error", "error"]);
  assert.equal(plan[1].createOwner, true);
  assert.equal(plan[2].createOwner, false);
  assert.equal(plan[1].ownerId, plan[2].ownerId);
  assert.equal(summarize(plan).customersCreated, 1);
  assert.deepEqual(plan[4].errors.map((e) => e.code), ["YEAR_INVALID"]);
  assert.deepEqual(plan[5].errors.map((e) => e.code), ["CUSTOMER_MISSING"]);
});

test("planVehicles: unknown owner is an error when auto-create is off", () => {
  const plan = planVehicles([["New Guy", "", "P1", "A", "B", "2001", ""]], vehMap, [], [], { ...OPTS, createMissingCustomers: false });
  assert.equal(plan[0].action, "error");
  assert.equal(plan[0].errors[0].code, "CUSTOMER_NOT_FOUND");
});

const invMap = autoMapColumns("inventory", ["Part", "SKU", "Cost", "Price", "Qty", "Min"]);

test("planInventory: SKU dedupe (case-insensitive), no-SKU by name, negative qty rejected", () => {
  const existing = [{ id: "p1", sku: "OIL-1", name: "Oil" }, { id: "p2", sku: null, name: "Wiper" }];
  const plan = planInventory(
    [
      ["Oil 5W30", "oil-1", "5", "12.99", "10", "2"], // dup sku
      ["wiper", "", "2", "9", "1", "0"], // dup name (no sku)
      ["Filter", "F-1", "3", "$8.50", "4", "1"], // create
      ["Filter dup", "F-1", "3", "8", "4", "1"], // dup in file
      ["Bad", "B-1", "", "abc", "1", "0"], // price
      ["Neg", "N-1", "", "1", "-3", "0"], // qty
    ],
    invMap,
    existing,
    OPTS
  );
  assert.deepEqual(plan.map((p) => p.action), ["skip_duplicate", "skip_duplicate", "create", "skip_duplicate", "error", "error"]);
  assert.equal(plan[2].data?.unitPrice, 8.5);
});

// ── Archivos ────────────────────────────────────────────────

test("parseImportFile reads XLSX and CSV (UTF-8 and Windows-1252) and rejects bad files", async () => {
  const xlsx = await parseImportFile(readFileSync(new URL("./fixtures/customers.xlsx", import.meta.url)), "c.xlsx");
  assert.deepEqual(xlsx.headers, ["Prénom", "Nom", "Courriel", "Téléphone"]);
  assert.equal(xlsx.rows.length, 2);
  assert.equal(xlsx.rows[0][0], "Marie");
  assert.equal(xlsx.rows[1][3], "5145550102");

  const utf8 = await parseImportFile(Buffer.from("Prénom,Nom\nÉlise,Roy\n"), "a.csv");
  assert.equal(utf8.rows[0][0], "Élise");
  const latin = await parseImportFile(Buffer.from("Pr\xe9nom,Nom\n\xc9lise,Roy\n", "latin1"), "a.csv");
  assert.equal(latin.headers[0], "Prénom");
  assert.equal(latin.rows[0][0], "Élise");

  await assert.rejects(parseImportFile(Buffer.from(""), "a.csv"), (e) => e instanceof ImportFileError && e.code === "EMPTY_FILE");
  await assert.rejects(parseImportFile(Buffer.from("a,b\n"), "a.csv"), (e) => e instanceof ImportFileError && e.code === "NO_ROWS");
  await assert.rejects(parseImportFile(Buffer.from("x"), "a.pdf"), (e) => e instanceof ImportFileError && e.code === "UNSUPPORTED_TYPE");
  await assert.rejects(parseImportFile(Buffer.alloc(5 * 1024 * 1024), "a.csv"), (e) => e instanceof ImportFileError && e.code === "FILE_TOO_LARGE");
});

// ── Plan comercial ──────────────────────────────────────────

test("checkImportRequest: Core is basic (no inventory, no update, 500 rows); Pro is full", () => {
  const core = { full: false };
  const pro = { full: true };
  assert.equal(checkImportRequest(core, "customers", OPTS, 500), null);
  assert.equal(checkImportRequest(core, "vehicles", OPTS, 501), "TOO_MANY_ROWS");
  assert.equal(checkImportRequest(core, "inventory", OPTS, 10), "UPGRADE_REQUIRED");
  assert.equal(checkImportRequest(core, "customers", UPDATE, 10), "UPGRADE_REQUIRED");
  assert.equal(checkImportRequest(pro, "inventory", UPDATE, 10_000), null);
  assert.equal(checkImportRequest(pro, "customers", OPTS, 10_001), "TOO_MANY_ROWS");
});

// ── Servicio (db mockeada) ──────────────────────────────────

function fakeTx(calls: { name: string; args: unknown }[]) {
  const rec = (name: string) => async (args: unknown) => {
    calls.push({ name, args });
    return { count: 1 };
  };
  return {
    client: { findMany: async (a: unknown) => (calls.push({ name: "client.findMany", args: a }), []), createMany: rec("client.createMany"), updateMany: rec("client.updateMany") },
    vehicle: { findMany: async (a: unknown) => (calls.push({ name: "vehicle.findMany", args: a }), []), createMany: rec("vehicle.createMany"), updateMany: rec("vehicle.updateMany") },
    inventoryPart: { findMany: async (a: unknown) => (calls.push({ name: "inventoryPart.findMany", args: a }), []), createMany: rec("inventoryPart.createMany"), updateMany: rec("inventoryPart.updateMany") },
    inventoryMovement: { createMany: rec("inventoryMovement.createMany") },
    importRun: { create: rec("importRun.create") },
  };
}

function mockTransaction(t: TestContext, tx: unknown) {
  const original = db.$transaction;
  (db as unknown as { $transaction: unknown }).$transaction = async (cb: (tx: unknown) => unknown) => cb(tx);
  t.after(() => {
    (db as unknown as { $transaction: unknown }).$transaction = original;
  });
}

test("buildImportPlan scopes every lookup to the shop (tenant isolation)", async (t) => {
  const calls: { name: string; args: unknown }[] = [];
  const tx = fakeTx(calls);
  await buildImportPlan(tx as never, "shop-A", "vehicles", [], vehMap, OPTS);
  await buildImportPlan(tx as never, "shop-A", "inventory", [], invMap, OPTS);
  const wheres = calls.map((c) => JSON.stringify((c.args as { where: unknown }).where));
  assert.deepEqual(wheres, [
    '{"shopId":"shop-A"}',
    '{"client":{"shopId":"shop-A"}}',
    '{"shopId":"shop-A"}',
  ]);
  void t;
});

test("executeImport (vehicles): creates owners with shop id, links vehicles to real owner ids, logs the run", async (t) => {
  const calls: { name: string; args: unknown }[] = [];
  mockTransaction(t, fakeTx(calls));
  const rows = [
    ["Bob Ray", "bob@x.com", "XYZ1", "Ford", "F150", "2018", ""],
    ["Bob Ray", "bob@x.com", "XYZ2", "Ford", "Ranger", "2020", ""],
    ["Bad", "", "Q1", "Kia", "Rio", "1850", ""],
  ];
  const report = await executeImport(
    { shopId: "shop-A", userId: "u1", fileName: "v.csv", entity: "vehicles", options: OPTS },
    rows,
    vehMap
  );
  assert.deepEqual(report.summary, { total: 3, create: 2, update: 0, skipped: 0, errors: 1, customersCreated: 1 });
  assert.equal(report.errorRows[0].rowNumber, 4);
  assert.deepEqual(report.errorRows[0].values, rows[2]);

  const owners = calls.find((c) => c.name === "client.createMany")!.args as { data: { id: string; shopId: string; language: string }[] };
  assert.equal(owners.data.length, 1);
  assert.equal(owners.data[0].shopId, "shop-A");
  assert.equal(owners.data[0].language, "FR");
  const veh = calls.find((c) => c.name === "vehicle.createMany")!.args as { data: { clientId: string }[] };
  assert.equal(veh.data.length, 2);
  assert.ok(veh.data.every((v) => v.clientId === owners.data[0].id));
  const run = calls.find((c) => c.name === "importRun.create")!.args as { data: Record<string, unknown> };
  assert.equal(run.data.shopId, "shop-A");
  assert.equal(run.data.created, 2);
});

test("executeImport (inventory): initial stock goes through the RECEIVE ledger; update never touches quantity", async (t) => {
  const calls: { name: string; args: unknown }[] = [];
  const tx = fakeTx(calls);
  tx.inventoryPart.findMany = async () => [{ id: "p1", sku: "OIL-1", name: "Oil" }] as never;
  mockTransaction(t, tx);
  const report = await executeImport(
    { shopId: "shop-A", userId: null, fileName: "i.csv", entity: "inventory", options: UPDATE },
    [
      ["Filter", "F-1", "3", "8.50", "4", "1"],
      ["Empty stock", "E-1", "", "2", "0", "0"],
      ["Oil renamed", "OIL-1", "6", "13", "99", "3"],
    ],
    invMap
  );
  assert.deepEqual([report.summary.create, report.summary.update], [2, 1]);
  const parts = calls.find((c) => c.name === "inventoryPart.createMany")!.args as { data: { id: string; quantityOnHand: number }[] };
  const moves = calls.find((c) => c.name === "inventoryMovement.createMany")!.args as { data: { partId: string; type: string; quantity: number; shopId: string }[] };
  assert.equal(moves.data.length, 1, "only the part with stock gets a RECEIVE movement");
  assert.deepEqual([moves.data[0].type, moves.data[0].quantity, moves.data[0].shopId], ["RECEIVE", 4, "shop-A"]);
  assert.equal(moves.data[0].partId, parts.data[0].id);
  const upd = calls.find((c) => c.name === "inventoryPart.updateMany")!.args as { where: { id: string; shopId: string }; data: Record<string, unknown> };
  assert.deepEqual(upd.where, { id: "p1", shopId: "shop-A" });
  assert.equal("quantityOnHand" in upd.data, false);
  assert.equal(upd.data.unitPrice, 13);
});

test("executeImport (customers): update strategy only writes non-empty fields and is shop-scoped", async (t) => {
  const calls: { name: string; args: unknown }[] = [];
  const tx = fakeTx(calls);
  tx.client.findMany = async () => [{ id: "c1", firstName: "Ann", lastName: "Lee", email: "ann@x.com", phone: null }] as never;
  mockTransaction(t, tx);
  await executeImport(
    { shopId: "shop-A", userId: null, fileName: "c.csv", entity: "customers", options: UPDATE },
    [["Ann", "", "ann@x.com", "514-555-0100"]],
    custMap
  );
  const upd = calls.find((c) => c.name === "client.updateMany")!.args as { where: unknown; data: Record<string, unknown> };
  assert.deepEqual(upd.where, { id: "c1", shopId: "shop-A" });
  assert.deepEqual(Object.keys(upd.data).sort(), ["email", "firstName", "phone"]);
});

test("reportPlan caps nothing silently: counts stay exact", () => {
  const plan = { entity: "customers" as const, rows: planCustomers([["", "x", "", ""]], custMap, [], OPTS) };
  const r = reportPlan(plan, [["", "x", "", ""]]);
  assert.equal(r.summary.errors, 1);
  assert.equal(r.errorRows.length, 1);
});
