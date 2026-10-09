// Minimal RFC 4180 CSV reader/writer plus spreadsheet-formula-injection defenses. No dependencies.

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;

/** Parses CSV text (BOM tolerated, CRLF/LF, quoted fields, "" escapes). Delimiter is auto-detected (, ; or tab). */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (c: string) => firstLine.split(c).length - 1;
  const delim = count(";") > count(",") && count(";") >= count("\t") ? ";" : count("\t") > count(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"' && field === "") { quoted = true; i++; continue; }
    if (c === delim) { row.push(field); field = ""; i++; continue; }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = ""; i++;
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = []; continue;
    }
    field += c; i++;
  }
  if (quoted) throw new Error("CSV_UNTERMINATED_QUOTE");
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

const FORMULA_START = /^[=+\-@\t\r]/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Strips control characters and collapses whitespace. */
export function cleanText(value: string): string { return value.replace(CONTROL, "").replace(/\s+/g, " ").trim(); }

/**
 * Neutralizes a free-text cell so it can never execute as a spreadsheet formula when later exported/opened
 * (OWASP CSV injection): a leading = + - @ TAB or CR is prefixed with an apostrophe.
 */
export function neutralizeFormula(value: string): string { return FORMULA_START.test(value) ? `'${value}` : value; }

/** Phone numbers may legitimately begin with "+"; everything else is restricted to dialing characters. */
export function cleanPhone(value: string): string | null {
  const v = cleanText(value);
  if (!v) return null;
  return /^\+?[0-9 ().\-xX#ext]{7,30}$/.test(v) ? v : null;
}

/** Escapes one value for CSV output, also defusing formulas. */
export function csvCell(value: unknown): string {
  const s = neutralizeFormula(String(value ?? ""));
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows: unknown[][]): string { return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n"; }
