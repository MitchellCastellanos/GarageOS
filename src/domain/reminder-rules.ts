// Recordatorios avanzados (Block 7) — reglas puras.

export interface RuleLike {
  id: string;
  keyword: string;
  intervalMonths: number | null;
  intervalKm: number | null;
  leadDays: number;
}

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Reglas cuya palabra clave aparece en alguna línea de la orden (sin acentos ni mayúsculas). */
export function matchRules<R extends RuleLike>(rules: R[], lineDescriptions: string[]): R[] {
  const haystack = lineDescriptions.map(fold);
  return rules.filter((r) => {
    const k = fold(r.keyword);
    return k.length > 0 && haystack.some((d) => d.includes(k));
  });
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // 31 ene + 1 mes = fin de febrero, no marzo.
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export interface PlannedReminder {
  dueDate: Date | null;
  dueMileage: number | null;
  /** Desde cuándo puede enviarse (fecha de vencimiento − leadDays, nunca en el pasado). */
  remindAt: Date;
}

export function planReminder(
  rule: RuleLike,
  completedAt: Date,
  mileage: number | null | undefined
): PlannedReminder | null {
  const dueDate = rule.intervalMonths ? addMonths(completedAt, rule.intervalMonths) : null;
  const dueMileage = rule.intervalKm && mileage != null ? mileage + rule.intervalKm : null;
  // Sin fecha no hay cuándo avisar (el envío es por fecha): una regla solo por km sin
  // intervalo de meses no genera recordatorio enviable.
  if (!dueDate) return null;
  const lead = Math.max(0, Math.min(rule.leadDays, 90));
  const remindAt = new Date(dueDate.getTime() - lead * 86_400_000);
  return { dueDate, dueMileage, remindAt: remindAt < completedAt ? completedAt : remindAt };
}

export interface RuleInput {
  name: string;
  keyword: string;
  intervalMonths: number | null;
  intervalKm: number | null;
  leadDays: number;
}

export type RuleValidation = { ok: true; value: RuleInput } | { ok: false; error: "NAME_REQUIRED" | "KEYWORD_REQUIRED" | "INTERVAL_REQUIRED" | "INVALID_NUMBER" };

export function validateRule(raw: {
  name: string;
  keyword: string;
  intervalMonths?: number | null;
  intervalKm?: number | null;
  leadDays?: number | null;
}): RuleValidation {
  const name = raw.name.trim().slice(0, 80);
  const keyword = raw.keyword.trim().slice(0, 80);
  if (!name) return { ok: false, error: "NAME_REQUIRED" };
  if (!keyword) return { ok: false, error: "KEYWORD_REQUIRED" };
  const months = raw.intervalMonths ?? null;
  const km = raw.intervalKm ?? null;
  const lead = raw.leadDays ?? 14;
  for (const n of [months, km, lead]) {
    if (n != null && (!Number.isInteger(n) || n < 0)) return { ok: false, error: "INVALID_NUMBER" };
  }
  if ((months ?? 0) > 120 || (km ?? 0) > 500_000 || lead > 90) return { ok: false, error: "INVALID_NUMBER" };
  // Los recordatorios se envían por fecha: hace falta un intervalo en meses (los km se muestran).
  if (!months) return { ok: false, error: "INTERVAL_REQUIRED" };
  return { ok: true, value: { name, keyword, intervalMonths: months, intervalKm: km || null, leadDays: lead } };
}
