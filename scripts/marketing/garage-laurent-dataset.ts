// Plan puro del taller de muestra "Garage Laurent" (marketing-garage-laurent-v1).
// Sin BD ni red: fechas, líneas, impuestos y agenda se calculan aquí y se verifican contra las
// cifras del brief. El seed (scripts/seed-marketing-garage-laurent.ts) solo escribe este plan.
import Decimal from "decimal.js";
import { computeTax, shopBaseLines, type TaxSnapshot } from "@/domain/fiscal";
import { parseShopDateTime } from "@/lib/shop-timezone";
import { planReminder } from "@/domain/reminder-rules";

export const SEED_KEY = "marketing-garage-laurent-v1";
/** Prefijo de los ids fijos: el seed es idempotente porque cada fila tiene id estable. */
export const ID_PREFIX = "mkt-gl-v1-";
export const SHOP_SLUG = "garage-laurent-demo";
export const SHOP_TZ = "America/Montreal";
export const OWNER_EMAIL = "demo.garage.laurent@example.com";
export const CONSENT_SOURCE = "demo_seed_fictitious";
export const APPROVAL_CHANNEL = "demo_seed_fictitious";

export const TAX_LINES = [
  { name: "GST", rate: "0.05" },
  { name: "QST", rate: "0.09975" },
];

/** Feriados de Québec de 2026 (días sin atención). Fuera de 2026 la regla es solo lunes–viernes. */
const QC_HOLIDAYS = new Set([
  "2026-01-01", "2026-04-03", "2026-05-18", "2026-06-24", "2026-07-01", "2026-09-07", "2026-10-12", "2026-12-25",
]);

export function id(key: string): string {
  return ID_PREFIX + key;
}

// ── Fechas (calendario del taller, America/Montreal) ─────────────────────────

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekday(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

export function isBusinessDay(ymd: string): boolean {
  const dow = weekday(ymd);
  return dow >= 1 && dow <= 5 && !QC_HOLIDAYS.has(ymd);
}

export function nextBusinessDay(ymd: string): string {
  let d = addDays(ymd, 1);
  while (!isBusinessDay(d)) d = addDays(d, 1);
  return d;
}

export function prevBusinessDay(ymd: string): string {
  let d = addDays(ymd, -1);
  while (!isBusinessDay(d)) d = addDays(d, -1);
  return d;
}

export function addBusinessDays(ymd: string, n: number): string {
  let d = ymd;
  for (let i = 0; i < n; i++) d = nextBusinessDay(d);
  return d;
}

/** Instante UTC de una hora local del taller. */
export function at(ymd: string, hhmm: string): Date {
  return parseShopDateTime(ymd, hhmm, SHOP_TZ);
}

/** Horario del taller: domingo 0 … sábado 6. Mismo formato que ShopWorkingHours. */
export const SHOP_HOURS: Record<number, { open: string; close: string } | null> = {
  0: null,
  1: { open: "08:00", close: "17:00" },
  2: { open: "08:00", close: "17:00" },
  3: { open: "08:00", close: "17:00" },
  4: { open: "08:00", close: "17:00" },
  5: { open: "08:00", close: "17:00" },
  6: { open: "09:00", close: "13:00" },
};

// ── Dinero ─────────────────────────────────────────────────────────────────

export type LineType = "PART" | "LABOUR" | "OTHER";
export interface LineSpec {
  description: string;
  itemType: LineType;
  quantity: string;
  unitPrice: string;
  /** Clave de inventario (solo piezas que se descuentan en la orden de trabajo). */
  partKey?: string;
}

export function lineTotal(line: LineSpec): string {
  return new Decimal(line.quantity).times(line.unitPrice).toFixed(2);
}

export interface Totals {
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  snapshot: TaxSnapshot;
}

export function totalsFor(lines: LineSpec[]): Totals {
  const subtotal = lines.reduce((s, l) => s.plus(lineTotal(l)), new Decimal(0));
  const tax = computeTax(subtotal, shopBaseLines(TAX_LINES));
  return {
    subtotal: subtotal.toFixed(2),
    taxRate: tax.taxRate.toString(),
    taxAmount: tax.taxAmount.toFixed(2),
    total: tax.total.toFixed(2),
    snapshot: tax.snapshot,
  };
}

// ── Catálogo, clientes, vehículos ──────────────────────────────────────────

export const SERVICES = [
  { key: "oil", labelFr: "Vidange d’huile synthétique", labelEn: "Synthetic oil change", labelEs: "Cambio de aceite sintético", iconKey: "oil", featured: true },
  { key: "tires", labelFr: "Changement de pneus sur jantes", labelEn: "Tire change on rims", labelEs: "Cambio de neumáticos montados", iconKey: "tires", featured: true },
  { key: "brakes", labelFr: "Inspection des freins", labelEn: "Brake inspection", labelEs: "Inspección de frenos", iconKey: "brakes", featured: true },
  { key: "inspection", labelFr: "Inspection préventive", labelEn: "Preventive inspection", labelEs: "Inspección preventiva", iconKey: "inspection", featured: true },
  { key: "diagnostics", labelFr: "Diagnostic moteur", labelEn: "Engine diagnostics", labelEs: "Diagnóstico de motor", iconKey: "diagnostics", featured: false },
  { key: "alignment", labelFr: "Alignement des roues", labelEn: "Wheel alignment", labelEs: "Alineación", iconKey: "alignment", featured: false },
] as const;

export type ClientKey = "camille" | "alexandre" | "sophie" | "nicolas" | "isabelle" | "francois" | "julie" | "marcandre";
export interface ClientSpec {
  key: ClientKey;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  consent: boolean;
  vehicle: { make: string; model: string; year: number; color: string; plate: string; mileage: number };
}

export const CLIENTS: ClientSpec[] = [
  { key: "camille", firstName: "Camille", lastName: "Tremblay", email: "camille.tremblay@example.com", phone: "+1 514 555 0101", consent: true,
    vehicle: { make: "Honda", model: "Civic", year: 2019, color: "Gris", plate: "DEMO-01", mileage: 92450 } },
  { key: "alexandre", firstName: "Alexandre", lastName: "Gagnon", email: "alexandre.gagnon@example.com", phone: "+1 514 555 0102", consent: true,
    vehicle: { make: "Toyota", model: "RAV4", year: 2021, color: "Blanc", plate: "DEMO-02", mileage: 68200 } },
  { key: "sophie", firstName: "Sophie", lastName: "Bouchard", email: "sophie.bouchard@example.com", phone: "+1 514 555 0103", consent: false,
    vehicle: { make: "Hyundai", model: "Tucson", year: 2020, color: "Bleu", plate: "DEMO-03", mileage: 81600 } },
  { key: "nicolas", firstName: "Nicolas", lastName: "Roy", email: "nicolas.roy@example.com", phone: "+1 514 555 0104", consent: false,
    vehicle: { make: "Volkswagen", model: "Golf", year: 2018, color: "Noir", plate: "DEMO-04", mileage: 112300 } },
  { key: "isabelle", firstName: "Isabelle", lastName: "Côté", email: "isabelle.cote@example.com", phone: "+1 514 555 0105", consent: true,
    vehicle: { make: "Mazda", model: "CX-5", year: 2022, color: "Rouge", plate: "DEMO-05", mileage: 46800 } },
  { key: "francois", firstName: "François", lastName: "Lavoie", email: "francois.lavoie@example.com", phone: "+1 514 555 0106", consent: false,
    vehicle: { make: "Subaru", model: "Forester", year: 2017, color: "Argent", plate: "DEMO-06", mileage: 137900 } },
  { key: "julie", firstName: "Julie", lastName: "Fortin", email: "julie.fortin@example.com", phone: "+1 514 555 0107", consent: true,
    vehicle: { make: "Kia", model: "Sportage", year: 2023, color: "Gris", plate: "DEMO-07", mileage: 32100 } },
  { key: "marcandre", firstName: "Marc-André", lastName: "Beaulieu", email: "marcandre.beaulieu@example.com", phone: "+1 514 555 0108", consent: false,
    vehicle: { make: "Nissan", model: "Sentra", year: 2020, color: "Blanc", plate: "DEMO-08", mileage: 74500 } },
];

export const STAFF = {
  owner: { key: "etienne", name: "Étienne Laurent" },
  mathieu: { key: "mathieu", name: "Mathieu Gagnon", email: "mathieu.gagnon@example.com" },
  olivier: { key: "olivier", name: "Olivier Bouchard", email: "olivier.bouchard@example.com" },
} as const;
export type MechanicKey = "mathieu" | "olivier";

export const PARTS = [
  { key: "huile", sku: "GL-HUILE-020", name: "Huile synthétique 0W-20", onHand: 40, threshold: 10, unitCost: "6.80", unitPrice: "12.00" },
  { key: "filtre", sku: "GL-FILTRE-001", name: "Filtre à huile", onHand: 25, threshold: 5, unitCost: "7.50", unitPrice: "18.00" },
  { key: "plaquettes", sku: "GL-FREIN-CIV19", name: "Plaquettes avant — Civic 2019", onHand: 4, threshold: 2, unitCost: "74.00", unitPrice: "125.00" },
  // Stock bajo a propósito: 2 existencias con umbral 4 para mostrar la alerta en Inventario.
  { key: "essuie", sku: "GL-ESSUIE-001", name: "Balais d’essuie-glace", onHand: 2, threshold: 4, unitCost: "9.50", unitPrice: "22.00" },
] as const;
export type PartKey = (typeof PARTS)[number]["key"];

// ── Agenda ─────────────────────────────────────────────────────────────────

export type DayRef =
  | { kind: "demo" }
  | { kind: "today" }
  | { kind: "afterDemo"; businessDays: number }
  | { kind: "pastBusiness"; calendarDaysAgo: number };

export interface AppointmentSpec {
  key: string;
  title: string;
  client: ClientKey;
  mechanic: MechanicKey;
  day: DayRef;
  time: string;
  source: "INTERNAL" | "PUBLIC_WEB";
  status: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
}

export const APPOINTMENTS: AppointmentSpec[] = [
  // Día de demostración (5 citas, sin solapamientos por mecánico).
  { key: "demo-civic-oil", title: "Vidange d’huile — Honda Civic", client: "camille", mechanic: "mathieu", day: { kind: "demo" }, time: "08:00", source: "PUBLIC_WEB", status: "CONFIRMED" },
  { key: "demo-tucson-brakes", title: "Inspection des freins — Hyundai Tucson", client: "sophie", mechanic: "mathieu", day: { kind: "demo" }, time: "09:00", source: "INTERNAL", status: "SCHEDULED" },
  { key: "demo-cx5-inspection", title: "Inspection préventive — Mazda CX-5", client: "isabelle", mechanic: "mathieu", day: { kind: "demo" }, time: "13:00", source: "INTERNAL", status: "CONFIRMED" },
  { key: "demo-golf-diagnostic", title: "Diagnostic moteur — Volkswagen Golf", client: "nicolas", mechanic: "olivier", day: { kind: "demo" }, time: "08:00", source: "INTERNAL", status: "CONFIRMED" },
  { key: "demo-rav4-tires", title: "Changement de pneus — Toyota RAV4", client: "alexandre", mechanic: "olivier", day: { kind: "demo" }, time: "10:00", source: "PUBLIC_WEB", status: "SCHEDULED" },
  // Hoy (fecha de referencia): la actividad que muestra el «Horaire du jour» del tablero.
  { key: "today-forester-oil", title: "Vidange d’huile — Subaru Forester", client: "francois", mechanic: "olivier", day: { kind: "today" }, time: "08:00", source: "INTERNAL", status: "CONFIRMED" },
  { key: "today-sportage-alignment", title: "Alignement des roues — Kia Sportage", client: "julie", mechanic: "mathieu", day: { kind: "today" }, time: "10:00", source: "PUBLIC_WEB", status: "CONFIRMED" },
  { key: "today-cx5-tires", title: "Rotation des pneus — Mazda CX-5", client: "isabelle", mechanic: "olivier", day: { kind: "today" }, time: "13:00", source: "PUBLIC_WEB", status: "SCHEDULED" },
  // Tres citas futuras en días laborales posteriores.
  { key: "future-sportage-tires", title: "Changement de pneus — Kia Sportage", client: "julie", mechanic: "mathieu", day: { kind: "afterDemo", businessDays: 2 }, time: "10:00", source: "PUBLIC_WEB", status: "SCHEDULED" },
  { key: "future-forester-oil", title: "Vidange d’huile — Subaru Forester", client: "francois", mechanic: "olivier", day: { kind: "afterDemo", businessDays: 3 }, time: "09:00", source: "INTERNAL", status: "SCHEDULED" },
  { key: "future-civic-inspection", title: "Inspection préventive — Honda Civic", client: "camille", mechanic: "mathieu", day: { kind: "afterDemo", businessDays: 5 }, time: "08:00", source: "INTERNAL", status: "SCHEDULED" },
  // Historial: dos completadas (Camille y la primera visita de François) y una cancelada.
  { key: "past-civic-oil", title: "Vidange d’huile — Honda Civic", client: "camille", mechanic: "mathieu", day: { kind: "pastBusiness", calendarDaysAgo: 24 }, time: "09:00", source: "PUBLIC_WEB", status: "COMPLETED" },
  { key: "past-forester-oil", title: "Vidange d’huile — Subaru Forester", client: "francois", mechanic: "olivier", day: { kind: "pastBusiness", calendarDaysAgo: 49 }, time: "13:00", source: "INTERNAL", status: "COMPLETED" },
  { key: "past-sentra-brakes", title: "Inspection des freins — Nissan Sentra", client: "marcandre", mechanic: "olivier", day: { kind: "pastBusiness", calendarDaysAgo: 14 }, time: "14:00", source: "PUBLIC_WEB", status: "CANCELLED" },
];

export const APPOINTMENT_MINUTES = 60;

export interface ResolvedAppointment extends AppointmentSpec {
  date: string;
  startsAt: Date;
  endsAt: Date;
}

export function resolveDay(ref: DayRef, refDate: string, demoDay: string): string {
  switch (ref.kind) {
    case "demo":
      return demoDay;
    case "today":
      return isBusinessDay(refDate) ? refDate : prevBusinessDay(refDate);
    case "afterDemo":
      return addBusinessDays(demoDay, ref.businessDays);
    case "pastBusiness":
      return prevBusinessDay(addDays(refDate, -ref.calendarDaysAgo));
  }
}

/** Día de demostración: el siguiente día laboral después de la fecha de referencia. */
export function demoDayAfter(refDate: string): string {
  return nextBusinessDay(refDate);
}

export function resolveAppointments(refDate: string): ResolvedAppointment[] {
  const demoDay = demoDayAfter(refDate);
  return APPOINTMENTS.map((a) => {
    const date = resolveDay(a.day, refDate, demoDay);
    const startsAt = at(date, a.time);
    return { ...a, date, startsAt, endsAt: new Date(startsAt.getTime() + APPOINTMENT_MINUTES * 60_000) };
  });
}

/** Hora local (HH:mm) de un instante en la zona del taller, para validar horario. */
function localHm(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: SHOP_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** Violaciones de la agenda: horario del taller y solapamientos por mecánico. Vacío = válida. */
export function agendaProblems(items: ResolvedAppointment[]): string[] {
  const problems: string[] = [];
  for (const a of items) {
    if (a.status === "CANCELLED") continue;
    const hours = SHOP_HOURS[weekday(a.date)];
    if (!hours) problems.push(`${a.key}: día cerrado (${a.date})`);
    else if (localHm(a.startsAt) < hours.open || localHm(a.endsAt) > hours.close) problems.push(`${a.key}: fuera de horario (${a.date})`);
  }
  for (const m of ["mathieu", "olivier"] as const) {
    const list = items.filter((a) => a.mechanic === m && a.status !== "CANCELLED").sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
    for (let i = 1; i < list.length; i++) {
      if (list[i].startsAt < list[i - 1].endsAt) problems.push(`solapamiento ${m}: ${list[i - 1].key} / ${list[i].key}`);
    }
  }
  return problems;
}

// ── Escenarios de documentos ─────────────────────────────────────────────

export const CAMILLE_LINES: LineSpec[] = [
  { description: "Huile moteur synthétique 0W-20", itemType: "PART", quantity: "5", unitPrice: "12.00", partKey: "huile" },
  { description: "Filtre à huile", itemType: "PART", quantity: "1", unitPrice: "18.00", partKey: "filtre" },
  { description: "Main-d’œuvre — vidange d’huile", itemType: "LABOUR", quantity: "0.5", unitPrice: "110.00" },
  { description: "Jeu de plaquettes de frein avant", itemType: "PART", quantity: "1", unitPrice: "125.00", partKey: "plaquettes" },
  { description: "Main-d’œuvre — remplacement des plaquettes avant", itemType: "LABOUR", quantity: "1", unitPrice: "110.00" },
];

export const ALEXANDRE_LINES: LineSpec[] = [
  { description: "Changement de pneus sur jantes", itemType: "LABOUR", quantity: "1", unitPrice: "60.00" },
  { description: "Équilibrage des roues", itemType: "LABOUR", quantity: "1", unitPrice: "40.00" },
  { description: "Entreposage saisonnier des pneus", itemType: "LABOUR", quantity: "1", unitPrice: "90.00" },
];

export const SOPHIE_LINES: LineSpec[] = [
  { description: "Inspection des freins", itemType: "LABOUR", quantity: "1", unitPrice: "55.00" },
  { description: "Nettoyage et lubrification des freins", itemType: "LABOUR", quantity: "1", unitPrice: "65.00" },
];

export const NICOLAS_LINES: LineSpec[] = [
  { description: "Diagnostic moteur", itemType: "LABOUR", quantity: "1", unitPrice: "135.00" },
];

export interface HistoricalInvoice {
  key: "francois-1" | "francois-2" | "isabelle-1" | "julie-1" | "nicolas-1" | "alexandre-1" | "julie-2" | "nicolas-2" | "marcandre-1";
  client: ClientKey;
  calendarDaysAgo: number;
  /** Cobrada dentro del mes de la fecha de referencia (nunca antes de su primer día laboral): alimenta «Revenus ce mois-ci». */
  thisMonth?: boolean;
  lines: LineSpec[];
  method: "CARD" | "CASH";
}

export const HISTORICAL_INVOICES: HistoricalInvoice[] = [
  { key: "francois-1", client: "francois", calendarDaysAgo: 49, method: "CARD", lines: [
    { description: "Huile moteur synthétique 0W-20", itemType: "PART", quantity: "5", unitPrice: "12.00", partKey: "huile" },
    { description: "Main-d’œuvre — vidange d’huile", itemType: "LABOUR", quantity: "1", unitPrice: "95.00" },
  ] },
  { key: "nicolas-1", client: "nicolas", calendarDaysAgo: 45, method: "CARD", lines: [
    { description: "Inspection préventive", itemType: "LABOUR", quantity: "1", unitPrice: "120.00" },
  ] },
  { key: "alexandre-1", client: "alexandre", calendarDaysAgo: 42, method: "CARD", lines: [
    { description: "Main-d’œuvre — vidange d’huile", itemType: "LABOUR", quantity: "1", unitPrice: "95.00" },
    { description: "Filtre à huile", itemType: "PART", quantity: "1", unitPrice: "18.00", partKey: "filtre" },
  ] },
  { key: "isabelle-1", client: "isabelle", calendarDaysAgo: 38, method: "CARD", lines: [
    { description: "Changement de pneus sur jantes", itemType: "LABOUR", quantity: "1", unitPrice: "60.00" },
    { description: "Équilibrage des roues", itemType: "LABOUR", quantity: "1", unitPrice: "40.00" },
  ] },
  { key: "julie-1", client: "julie", calendarDaysAgo: 31, method: "CARD", lines: [
    { description: "Alignement des roues", itemType: "LABOUR", quantity: "1", unitPrice: "85.00" },
    { description: "Huile moteur synthétique 0W-20", itemType: "PART", quantity: "5", unitPrice: "12.00", partKey: "huile" },
    { description: "Filtre à huile", itemType: "PART", quantity: "1", unitPrice: "18.00", partKey: "filtre" },
    { description: "Main-d’œuvre — vidange d’huile", itemType: "LABOUR", quantity: "0.5", unitPrice: "110.00" },
  ] },
  { key: "francois-2", client: "francois", calendarDaysAgo: 14, method: "CASH", lines: [
    { description: "Inspection des freins", itemType: "LABOUR", quantity: "1", unitPrice: "60.00" },
    { description: "Alignement des roues", itemType: "LABOUR", quantity: "1", unitPrice: "85.00" },
  ] },
];

HISTORICAL_INVOICES.push(
  { key: "julie-2", client: "julie", calendarDaysAgo: 5, thisMonth: true, method: "CARD", lines: [
    { description: "Alignement des roues", itemType: "LABOUR", quantity: "1", unitPrice: "85.00" },
    { description: "Rotation des pneus", itemType: "LABOUR", quantity: "1", unitPrice: "40.00" },
  ] },
  { key: "nicolas-2", client: "nicolas", calendarDaysAgo: 4, thisMonth: true, method: "CARD", lines: [
    { description: "Inspection des freins", itemType: "LABOUR", quantity: "1", unitPrice: "60.00" },
    { description: "Nettoyage et lubrification des freins", itemType: "LABOUR", quantity: "1", unitPrice: "65.00" },
  ] },
  { key: "marcandre-1", client: "marcandre", calendarDaysAgo: 1, thisMonth: true, method: "CASH", lines: [
    { description: "Changement de pneus sur jantes", itemType: "LABOUR", quantity: "1", unitPrice: "60.00" },
    { description: "Équilibrage des roues", itemType: "LABOUR", quantity: "1", unitPrice: "40.00" },
  ] },
);

/** Primer día laboral del mes de `ymd`. */
export function firstBusinessDayOfMonth(ymd: string): string {
  let d = `${ymd.slice(0, 8)}01`;
  while (!isBusinessDay(d)) d = addDays(d, 1);
  return d;
}

/** Día (YYYY-MM-DD, zona del taller) en que se emite y cobra una factura histórica. */
export function historicalInvoiceDay(spec: Pick<HistoricalInvoice, "calendarDaysAgo" | "thisMonth">, refDate: string): string {
  const day = prevBusinessDay(addDays(refDate, -spec.calendarDaysAgo));
  if (!spec.thisMonth) return day;
  const first = firstBusinessDayOfMonth(refDate);
  return day < first ? first : day;
}

/** Cifras del brief que el plan debe reproducir exactamente. */
export const BRIEF_TOTALS = {
  camille: { subtotal: "368.00", tps: "18.40", tvq: "36.71", total: "423.11" },
  alexandre: { subtotal: "190.00", tps: "9.50", tvq: "18.95", total: "218.45" },
  sophie: { subtotal: "120.00", tps: "6.00", tvq: "11.97", total: "137.97" },
} as const;

export function assertBriefTotals(): void {
  const cases: [string, LineSpec[], (typeof BRIEF_TOTALS)[keyof typeof BRIEF_TOTALS]][] = [
    ["camille", CAMILLE_LINES, BRIEF_TOTALS.camille],
    ["alexandre", ALEXANDRE_LINES, BRIEF_TOTALS.alexandre],
    ["sophie", SOPHIE_LINES, BRIEF_TOTALS.sophie],
  ];
  for (const [name, lines, expected] of cases) {
    const t = totalsFor(lines);
    const tps = t.snapshot.lines.find((l) => l.name === "GST")?.amount;
    const tvq = t.snapshot.lines.find((l) => l.name === "QST")?.amount;
    const got = { subtotal: t.subtotal, tps, tvq, total: t.total };
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      throw new Error(`Totales de ${name} no cuadran con el brief: ${JSON.stringify(got)} vs ${JSON.stringify(expected)}`);
    }
  }
}

/** Recordatorio de la regla de vidange de Camille (motor real: planReminder). */
export const OIL_RULE = { id: id("rule-oil"), name: "Vidange d’huile synthétique", keyword: "huile", intervalMonths: 6, intervalKm: 8000, leadDays: 14 };

export function camilleReminderPlan(jobDate: Date, mileage: number) {
  return planReminder(OIL_RULE, jobDate, mileage);
}


