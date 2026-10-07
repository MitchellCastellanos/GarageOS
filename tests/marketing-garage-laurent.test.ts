// Plan puro del seed de Garage Laurent (marketing-garage-laurent-v1): fechas, agenda, impuestos y cifras del brief.
// No toca la base de datos: la verificación contra Postgres vive en el runbook del seed.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as D from "../scripts/marketing/garage-laurent-dataset";

const REF = "2026-10-06"; // martes

test("las cifras de estimado, Work Order y factura coinciden con el brief", () => {
  assert.doesNotThrow(() => D.assertBriefTotals());
  const camille = D.totalsFor(D.CAMILLE_LINES);
  assert.equal(camille.subtotal, "368.00");
  assert.equal(camille.taxAmount, "55.11");
  assert.equal(camille.total, "423.11");
  const tps = camille.snapshot.lines.find((l) => l.name === "GST");
  const tvq = camille.snapshot.lines.find((l) => l.name === "QST");
  assert.equal(tps?.amount, "18.40");
  assert.equal(tvq?.amount, "36.71");
  assert.equal(tvq?.rate, "0.09975");
});

test("Alexandre y Sophie cuadran con TPS 5 % y TVQ 9,975 % sobre el subtotal", () => {
  const alex = D.totalsFor(D.ALEXANDRE_LINES);
  assert.deepEqual([alex.subtotal, alex.total], ["190.00", "218.45"]);
  const sophie = D.totalsFor(D.SOPHIE_LINES);
  assert.deepEqual([sophie.subtotal, sophie.total], ["120.00", "137.97"]);
});

test("el día de demostración es el siguiente día laboral (saltando feriados)", () => {
  assert.equal(D.demoDayAfter("2026-10-06"), "2026-10-07"); // martes → miércoles
  assert.equal(D.demoDayAfter("2026-10-09"), "2026-10-13"); // viernes → martes (lunes 12 es feriado)
  assert.equal(D.isBusinessDay("2026-10-10"), false); // sábado
  assert.equal(D.isBusinessDay("2026-10-12"), false); // Action de grâce
});

test("la agenda respeta el horario del taller y no tiene solapamientos por mecánico", () => {
  assert.deepEqual(D.agendaProblems(D.resolveAppointments(REF)), []);
});

test("la agenda tiene 5 citas el día de demostración, 3 futuras, 2 completadas, 1 cancelada y fuentes WEB e INTERNAL", () => {
  const items = D.resolveAppointments(REF);
  const demo = D.demoDayAfter(REF);
  assert.equal(items.filter((a) => a.date === demo).length, 5);
  const future = items.filter((a) => a.date > demo);
  assert.equal(future.length, 3);
  assert.equal(items.filter((a) => a.status === "COMPLETED").length, 2);
  assert.equal(items.filter((a) => a.status === "CANCELLED").length, 1);
  const sources = new Set(items.map((a) => a.source));
  assert.ok(sources.has("PUBLIC_WEB") && sources.has("INTERNAL"));
  for (const a of items) assert.equal(a.endsAt.getTime() - a.startsAt.getTime(), 60 * 60_000);
});

test("las citas históricas caen dentro de las últimas ocho semanas y en días laborales", () => {
  for (const h of D.HISTORICAL_INVOICES) {
    const date = D.historicalInvoiceDay(h, REF);
    if (h.thisMonth) assert.equal(date.slice(0, 7), REF.slice(0, 7), `${h.key} no cae en el mes de referencia`);
    assert.ok(D.isBusinessDay(date), `${h.key} no cae en día laboral`);
    assert.ok(h.calendarDaysAgo <= 56, `${h.key} fuera de 8 semanas`);
  }
  assert.equal(D.HISTORICAL_INVOICES.length, 9);
  assert.equal(D.HISTORICAL_INVOICES.filter((h) => h.thisMonth).length, 3);
});

test("el recordatorio de vidange de Camille usa la regla real: 100 450 km y 6 meses", () => {
  const job = D.at("2026-09-14", "16:30");
  const plan = D.camilleReminderPlan(job, 92450);
  assert.ok(plan);
  assert.equal(plan.dueMileage, 100450);
  assert.equal(plan.dueDate?.toISOString().slice(0, 10), "2027-03-14");
  assert.ok(plan.remindAt.getTime() > D.at(REF, "00:00").getTime(), "el aviso no debe quedar vencido");
});

test("el horario del taller: domingo cerrado, sábado 09:00–13:00, lunes a viernes 08:00–17:00", () => {
  assert.equal(D.SHOP_HOURS[0], null);
  assert.deepEqual(D.SHOP_HOURS[6], { open: "09:00", close: "13:00" });
  assert.deepEqual(D.SHOP_HOURS[3], { open: "08:00", close: "17:00" });
});

test("todos los ids de muestra usan el prefijo estable y no chocan entre sí", () => {
  const ids = [
    ...D.CLIENTS.map((c) => D.id(`client-${c.key}`)),
    ...D.CLIENTS.map((c) => D.id(`vehicle-${c.key}`)),
    ...D.APPOINTMENTS.map((a) => D.id(`appt-${a.key}`)),
    ...D.PARTS.map((p) => D.id(`part-${p.key}`)),
  ];
  assert.equal(new Set(ids).size, ids.length);
  for (const i of ids) assert.ok(i.startsWith("mkt-gl-v1-"));
});

test("las piezas con consumo y la de stock bajo están definidas", () => {
  const low = D.PARTS.filter((p) => p.onHand <= p.threshold).map((p) => p.sku);
  assert.deepEqual(low, ["GL-ESSUIE-001"]);
  const consumed = D.CAMILLE_LINES.filter((l) => l.partKey).map((l) => l.partKey);
  assert.deepEqual(consumed, ["huile", "filtre", "plaquettes"]);
});

test("hay citas hoy y las facturas del mes nunca salen del mes de referencia, ni a inicio de mes", () => {
  const today = D.resolveAppointments(REF).filter((a) => a.day.kind === "today");
  assert.equal(today.length, 3);
  for (const a of today) assert.equal(a.date, REF);
  assert.deepEqual(D.agendaProblems(D.resolveAppointments(REF)), []);
  for (const ref of ["2026-11-02", "2026-12-01", "2026-10-30"]) {
    for (const h of D.HISTORICAL_INVOICES.filter((x) => x.thisMonth)) {
      const day = D.historicalInvoiceDay(h, ref);
      assert.equal(day.slice(0, 7), ref.slice(0, 7));
      assert.ok(D.isBusinessDay(day));
    }
  }
});
