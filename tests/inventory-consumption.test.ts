import assert from "node:assert/strict";
import test from "node:test";
import { computeConsumptionDeltas, sumDesired } from "../src/domain/inventory-consumption";
import {
  InsufficientStockError,
  InventoryLineError,
  reconcileWorkOrderConsumption,
  validateStockedLines,
} from "../src/lib/inventory-consumption";

// ── Fake transaccional en memoria (piezas, líneas y ledger) ─────────────────

interface Part { id: string; shopId: string; name: string; quantityOnHand: number }
interface Line { workOrderId: string; partId: string | null; quantity: number }
interface Move { shopId: string; partId: string; workOrderId: string | null; type: string; quantity: number; note: string | null }

function makeTx(parts: Part[], lines: Line[], orders: Record<string, string> = {}) {
  const moves: Move[] = [];
  const locks: string[] = [];
  const tx = {
    $queryRaw: async (_s: TemplateStringsArray, ...vals: unknown[]) => void locks.push(String(vals[0])),
    workOrderLine: {
      findMany: async ({ where }: { where: { workOrderId: string; workOrder: { shopId: string } } }) => {
        if (orders[where.workOrderId] !== where.workOrder.shopId) return [];
        return lines.filter((l) => l.workOrderId === where.workOrderId && l.partId != null);
      },
    },
    inventoryMovement: {
      groupBy: async ({ where }: { where: { shopId: string; workOrderId: string } }) => {
        const sums = new Map<string, number>();
        for (const m of moves) {
          if (m.shopId === where.shopId && m.workOrderId === where.workOrderId) sums.set(m.partId, (sums.get(m.partId) ?? 0) + m.quantity);
        }
        return [...sums].map(([partId, q]) => ({ partId, _sum: { quantity: q } }));
      },
      create: async ({ data }: { data: Move }) => void moves.push(data),
    },
    inventoryPart: {
      findMany: async ({ where }: { where: { id: { in: string[] }; shopId: string } }) =>
        parts.filter((p) => where.id.in.includes(p.id) && p.shopId === where.shopId),
      findFirst: async ({ where }: { where: { id: string; shopId: string } }) => parts.find((p) => p.id === where.id && p.shopId === where.shopId) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; shopId: string; quantityOnHand?: { gte: number } }; data: { quantityOnHand: { decrement?: number; increment?: number } } }) => {
        const p = parts.find((x) => x.id === where.id && x.shopId === where.shopId);
        if (!p) return { count: 0 };
        if (where.quantityOnHand && p.quantityOnHand < where.quantityOnHand.gte) return { count: 0 };
        p.quantityOnHand += (data.quantityOnHand.increment ?? 0) - (data.quantityOnHand.decrement ?? 0);
        return { count: 1 };
      },
    },
  };
  return { tx: tx as never, moves, locks };
}

const setup = () => {
  const parts: Part[] = [
    { id: "p1", shopId: "A", name: "Oil filter", quantityOnHand: 10 },
    { id: "p2", shopId: "A", name: "Wiper", quantityOnHand: 2 },
    { id: "px", shopId: "B", name: "Other shop part", quantityOnHand: 50 },
  ];
  const lines: Line[] = [];
  const orders = { wo1: "A", wo2: "A" };
  return { parts, lines, orders, ...makeTx(parts, lines, orders) };
};

test("deltas: idempotent when nothing changed; sums duplicate part lines", () => {
  const desired = sumDesired([
    { partId: "p1", quantity: 2 },
    { partId: "p1", quantity: 1 },
    { partId: null, quantity: 9 },
  ]);
  assert.deepEqual([...desired], [["p1", 3]]);
  assert.deepEqual(computeConsumptionDeltas(desired, new Map([["p1", 3]])), []);
  assert.deepEqual(computeConsumptionDeltas(desired, new Map([["p1", 1], ["p2", 2]])), [
    { partId: "p2", delta: -2 },
    { partId: "p1", delta: 2 },
  ]);
});

test("using a part consumes stock once; re-saving the same work order never double-consumes", async () => {
  const s = setup();
  s.lines.push({ workOrderId: "wo1", partId: "p1", quantity: 3 });
  await reconcileWorkOrderConsumption(s.tx, "A", "wo1", { orderNumber: "WO-1" });
  assert.equal(s.parts[0].quantityOnHand, 7);
  assert.deepEqual(s.moves.map((m) => [m.type, m.quantity, m.workOrderId, m.note]), [["CONSUMED", -3, "wo1", "WO WO-1"]]);

  await reconcileWorkOrderConsumption(s.tx, "A", "wo1");
  await reconcileWorkOrderConsumption(s.tx, "A", "wo1");
  assert.equal(s.parts[0].quantityOnHand, 7);
  assert.equal(s.moves.length, 1, "no extra ledger rows when nothing changed");
  assert.equal(s.locks.length, 3, "every reconcile locks the work order first");
});

test("changing quantity and removing a line corrects stock through the ledger", async () => {
  const s = setup();
  s.lines.push({ workOrderId: "wo1", partId: "p1", quantity: 3 });
  await reconcileWorkOrderConsumption(s.tx, "A", "wo1");

  s.lines[0].quantity = 5; // +2 more
  await reconcileWorkOrderConsumption(s.tx, "A", "wo1");
  assert.equal(s.parts[0].quantityOnHand, 5);

  s.lines[0].quantity = 1; // give back 4
  await reconcileWorkOrderConsumption(s.tx, "A", "wo1");
  assert.equal(s.parts[0].quantityOnHand, 9);

  s.lines.length = 0; // line removed
  await reconcileWorkOrderConsumption(s.tx, "A", "wo1");
  assert.equal(s.parts[0].quantityOnHand, 10);
  assert.deepEqual(s.moves.map((m) => [m.type, m.quantity]), [["CONSUMED", -3], ["CONSUMED", -2], ["RETURN", 4], ["RETURN", 1]]);
  // El ledger cuadra: 10 + Σ movimientos = existencia.
  assert.equal(10 + s.moves.reduce((n, m) => n + m.quantity, 0), s.parts[0].quantityOnHand);
});

test("switching a line to a different part returns the old one and consumes the new one", async () => {
  const s = setup();
  s.lines.push({ workOrderId: "wo1", partId: "p1", quantity: 2 });
  await reconcileWorkOrderConsumption(s.tx, "A", "wo1");
  s.lines[0].partId = "p2";
  await reconcileWorkOrderConsumption(s.tx, "A", "wo1");
  assert.deepEqual([s.parts[0].quantityOnHand, s.parts[1].quantityOnHand], [10, 0]);
});

test("insufficient stock is refused with a typed error and leaves stock untouched", async () => {
  const s = setup();
  s.lines.push({ workOrderId: "wo1", partId: "p2", quantity: 3 }); // only 2 on hand
  await assert.rejects(
    reconcileWorkOrderConsumption(s.tx, "A", "wo1"),
    (e) => e instanceof InsufficientStockError && e.partName === "Wiper" && e.available === 2 && e.needed === 3
  );
  assert.equal(s.parts[1].quantityOnHand, 2);
  assert.equal(s.moves.length, 0);
});

test("two work orders share one part: the second only gets what is left", async () => {
  const s = setup();
  s.lines.push({ workOrderId: "wo1", partId: "p2", quantity: 2 });
  await reconcileWorkOrderConsumption(s.tx, "A", "wo1");
  s.lines.push({ workOrderId: "wo2", partId: "p2", quantity: 1 });
  await assert.rejects(reconcileWorkOrderConsumption(s.tx, "A", "wo2"), InsufficientStockError);
  assert.equal(s.parts[1].quantityOnHand, 0);
});

test("cancelling/deleting a work order releases everything it consumed", async () => {
  const s = setup();
  s.lines.push({ workOrderId: "wo1", partId: "p1", quantity: 4 }, { workOrderId: "wo1", partId: "p2", quantity: 2 });
  await reconcileWorkOrderConsumption(s.tx, "A", "wo1");
  assert.deepEqual([s.parts[0].quantityOnHand, s.parts[1].quantityOnHand], [6, 0]);
  await reconcileWorkOrderConsumption(s.tx, "A", "wo1", { release: true });
  assert.deepEqual([s.parts[0].quantityOnHand, s.parts[1].quantityOnHand], [10, 2]);
  await reconcileWorkOrderConsumption(s.tx, "A", "wo1", { release: true }); // idempotent
  assert.deepEqual([s.parts[0].quantityOnHand, s.parts[1].quantityOnHand], [10, 2]);
});

test("tenant isolation: another shop's part cannot be attached or consumed", async () => {
  const s = setup();
  await assert.rejects(
    validateStockedLines(s.tx, "A", [{ partId: "px", quantity: 1 }]),
    (e) => e instanceof InventoryLineError && e.code === "PART_NOT_FOUND"
  );
  // Aunque una línea apuntara a la pieza ajena, el decremento está scoped por shopId.
  s.lines.push({ workOrderId: "wo1", partId: "px", quantity: 1 });
  await assert.rejects(reconcileWorkOrderConsumption(s.tx, "A", "wo1"), InventoryLineError);
  assert.equal(s.parts[2].quantityOnHand, 50);
  // Y una orden de otro taller no ve líneas ajenas.
  s.lines.push({ workOrderId: "wo9", partId: "p1", quantity: 1 });
  await reconcileWorkOrderConsumption(s.tx, "B", "wo9");
  assert.equal(s.parts[0].quantityOnHand, 10);
});

test("validateStockedLines: whole quantities only; free-text lines are not validated", async () => {
  const s = setup();
  await assert.rejects(
    validateStockedLines(s.tx, "A", [{ partId: "p1", quantity: 1.5 }]),
    (e) => e instanceof InventoryLineError && e.code === "FRACTIONAL_QUANTITY"
  );
  await validateStockedLines(s.tx, "A", [{ partId: "", quantity: 1.5 }, { partId: "p1", quantity: 2 }]);
});
