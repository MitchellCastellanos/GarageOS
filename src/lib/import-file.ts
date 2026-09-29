// Lectura de archivos de importación (CSV / XLSX) a una tabla de strings.
import { readSheet } from "read-excel-file/node";
import { IMPORT_LIMITS, parseCsv } from "@/domain/import";

export interface ImportTable {
  headers: string[];
  rows: string[][];
}

export class ImportFileError extends Error {
  constructor(public readonly code: "EMPTY_FILE" | "FILE_TOO_LARGE" | "UNSUPPORTED_TYPE" | "UNREADABLE" | "NO_ROWS") {
    super(code);
    this.name = "ImportFileError";
  }
}

function decodeText(buf: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    // Exportaciones de Excel/sistemas viejos en Windows-1252.
    return new TextDecoder("windows-1252").decode(buf);
  }
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function isXlsx(buf: Buffer, fileName: string): boolean {
  // .xlsx es un ZIP ("PK").
  return fileName.toLowerCase().endsWith(".xlsx") || (buf[0] === 0x50 && buf[1] === 0x4b);
}

export async function parseImportFile(buf: Buffer, fileName: string): Promise<ImportTable> {
  if (buf.length === 0) throw new ImportFileError("EMPTY_FILE");
  if (buf.length > IMPORT_LIMITS.maxFileBytes) throw new ImportFileError("FILE_TOO_LARGE");
  const lower = fileName.toLowerCase();
  const xlsx = isXlsx(buf, fileName);
  if (!xlsx && !/\.(csv|txt|tsv)$/.test(lower)) throw new ImportFileError("UNSUPPORTED_TYPE");

  let all: string[][];
  try {
    if (xlsx) {
      const data = (await readSheet(buf)) as unknown[][];
      all = data.map((r) => r.map(cellToString)).filter((r) => r.some((c) => c.trim() !== ""));
    } else {
      all = parseCsv(decodeText(buf));
    }
  } catch {
    throw new ImportFileError("UNREADABLE");
  }
  if (all.length < 2) throw new ImportFileError("NO_ROWS");
  const [headers, ...rows] = all;
  return { headers: headers.map((h) => h.trim()), rows };
}
