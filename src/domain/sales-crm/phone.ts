// Canadian business telephone normalization — pure. Stricter than `phoneDigits` (which only needs ≥10 digits for duplicate matching):
// a callable number must be a valid NANP number that Canada actually assigns, so a foreign, malformed or placeholder number never reaches a dialer.

/** Canadian geographic area codes (CNAC), incl. overlays. Anything else (US, Caribbean, unassigned) is not a Canadian business number. */
export const CANADIAN_AREA_CODES: ReadonlySet<string> = new Set([
  "204", "226", "236", "249", "250", "263", "289", "306", "343", "354", "365", "367", "368", "382", "403", "416", "418", "428", "431", "437", "438", "450", "474", "506", "514",
  "519", "548", "579", "581", "584", "587", "604", "613", "639", "647", "672", "683", "705", "709", "742", "778", "780", "782", "807", "819", "825", "867", "873", "879", "902", "905",
]);

/** Toll-free NANP codes. A published toll-free line is a business line by nature, but it often belongs to a head office, so it is flagged as such. */
export const TOLL_FREE_AREA_CODES: ReadonlySet<string> = new Set(["800", "833", "844", "855", "866", "877", "888"]);

export type CanadianPhoneKind = "GEOGRAPHIC" | "TOLL_FREE";
export interface CanadianPhone { e164: string; national: string; areaCode: string; kind: CanadianPhoneKind }

/** Strips formatting and extension text; returns the 10 national digits or null (country code 1 accepted, anything else rejected). */
export function nationalDigits(raw: string | null | undefined): string | null {
  const base = (raw ?? "").replace(/\s*(?:x|ext\.?|poste|#)\s*\d{1,6}\s*$/i, "");
  let d = base.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? d : null;
}

/** Valid Canadian (geographic or toll-free) number, or null. NXX and NPA must start 2-9; N11 area codes/exchanges and 555-01xx fictional numbers are rejected. */
export function normalizeCanadianPhone(raw: string | null | undefined): CanadianPhone | null {
  const d = nationalDigits(raw);
  if (!d) return null;
  const npa = d.slice(0, 3), nxx = d.slice(3, 6), line = d.slice(6);
  if (!/^[2-9]/.test(npa) || !/^[2-9]/.test(nxx)) return null;
  if (npa.slice(1) === "11" || nxx.slice(1) === "11") return null;
  if (nxx === "555" && /^01\d\d$/.test(line)) return null;
  if (/^(\d)\1{9}$/.test(d)) return null;
  const kind: CanadianPhoneKind | null = TOLL_FREE_AREA_CODES.has(npa) ? "TOLL_FREE" : CANADIAN_AREA_CODES.has(npa) ? "GEOGRAPHIC" : null;
  if (!kind) return null;
  return { e164: `+1${d}`, national: d, areaCode: npa, kind };
}

/** First valid Canadian number of a source's phone list (geographic preferred over toll-free), so a good second number is not lost behind a malformed first one. */
export function pickBestCanadianPhone(phones: readonly string[] | null | undefined): { raw: string; phone: CanadianPhone } | null {
  let tollFree: { raw: string; phone: CanadianPhone } | null = null;
  for (const raw of phones ?? []) {
    const phone = normalizeCanadianPhone(raw);
    if (!phone) continue;
    if (phone.kind === "GEOGRAPHIC") return { raw, phone };
    tollFree ??= { raw, phone };
  }
  return tollFree;
}
