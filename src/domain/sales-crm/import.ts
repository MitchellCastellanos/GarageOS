import { createHash } from "node:crypto";
import { canonicalAddress, type AddressQuality } from "@/domain/sales-crm/address";
import { cleanText, neutralizeFormula, parseCsv, MAX_IMPORT_ROWS } from "@/domain/sales-crm/csv";
import { classifyAgainstPool, type MatchKey, type MatchReason, type PoolEntry } from "@/domain/sales-crm/dedupe";
import { normalizeBusinessName, normalizeEmail, phoneDigits, websiteDomain } from "@/domain/sales-crm/normalize";
import { IMPORT_FIELDS } from "@/domain/sales-crm/import-fields";
import { cityKey } from "@/domain/sales-crm/territory";
import { contactInputSchema, prospectInputSchema, type ContactInput, type ProspectInput } from "@/domain/sales-crm/validation";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Canonical import column → accepted header aliases (English and French; accents/case/punctuation ignored). */
const ALIASES: Record<string, string[]> = {
  name: ["name", "business", "business_name", "company", "company_name", "shop", "shop_name", "garage", "nom", "entreprise", "nom_de_l_entreprise", "atelier"],
  website: ["website", "web", "url", "site_web", "site"],
  address: ["address", "street", "adresse", "rue"],
  city: ["city", "ville"],
  province: ["province", "state", "region"],
  postalCode: ["postal_code", "postal", "zip", "zip_code", "code_postal"],
  phone: ["phone", "telephone", "tel", "phone_number", "telephone_de_l_entreprise"],
  email: ["email", "e_mail", "courriel", "general_email", "business_email"],
  industry: ["industry", "category", "type", "categorie", "secteur"],
  shopSize: ["shop_size", "size", "staff", "staff_size", "employees", "taille"],
  locationCount: ["locations", "location_count", "nb_locations", "succursales"],
  currentSoftware: ["software", "current_software", "logiciel", "logiciel_actuel"],
  externalId: ["external_id", "source_id", "source_record_id", "record_id", "id", "identifiant", "identifiant_source", "id_source"],
  sourceUrl: ["source_url", "source_link", "url_source", "lien_source", "listing_url"],
  source: ["source", "lead_source"],
  sourceDetail: ["source_detail", "detail_source"],
  preferredLanguage: ["language", "preferred_language", "langue", "langue_preferee"],
  tags: ["tags", "etiquettes"],
  notes: ["notes", "note", "comments", "commentaires"],
  doNotContact: ["do_not_contact", "dnc", "opt_out", "unsubscribed", "ne_pas_contacter", "desabonne"],
  contactName: ["contact_name", "contact", "owner", "owner_name", "nom_du_contact", "contact_nom", "proprietaire"],
  contactTitle: ["contact_title", "title", "role", "titre", "poste"],
  contactEmail: ["contact_email", "owner_email", "courriel_du_contact", "contact_courriel"],
  contactPhone: ["contact_phone", "owner_phone", "mobile", "cell", "telephone_du_contact"],
  contactLanguage: ["contact_language", "langue_du_contact"],
  decisionMaker: ["decision_maker", "is_decision_maker", "decideur", "preneur_de_decision"],
};
const ALIAS_LOOKUP = new Map<string, string>();
for (const [canonical, list] of Object.entries(ALIASES)) for (const a of list) if (!ALIAS_LOOKUP.has(a)) ALIAS_LOOKUP.set(a, canonical);
/** Canonical import fields a column can be mapped to (the owner picks them in the wizard; nothing source-specific is hardcoded). */
export { IMPORT_FIELDS };
/** Fields that have header aliases (kept equal to IMPORT_FIELDS by a test). */
export const ALIAS_FIELDS: readonly string[] = Object.keys(ALIASES);
export type ImportMapping = Record<string, string | null>;

/** Header index → canonical field using the EN/FR aliases. First column wins when two columns claim the same field. */
export function suggestMapping(headers: string[]): ImportMapping {
  const used = new Set<string>(), out: ImportMapping = {};
  headers.forEach((h, i) => {
    const f = ALIAS_LOOKUP.get(fold(h)) ?? null;
    if (f && !used.has(f)) { used.add(f); out[String(i)] = f; } else out[String(i)] = null;
  });
  return out;
}
/** Validates a user-supplied mapping: known fields only, each at most once, indexes inside the header row. */
export function sanitizeMapping(raw: unknown, columnCount: number): ImportMapping | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const used = new Set<string>(), out: ImportMapping = {};
  for (let i = 0; i < columnCount; i++) {
    const v = (raw as Record<string, unknown>)[String(i)];
    if (v === null || v === undefined || v === "") { out[String(i)] = null; continue; }
    if (typeof v !== "string" || !(IMPORT_FIELDS as readonly string[]).includes(v) || used.has(v)) return null;
    used.add(v); out[String(i)] = v;
  }
  return out;
}
/** First rows and header labels for the mapping step. Cells are truncated; nothing is stored. */
export function inspectCsv(csvText: string): { headerError: ParsedImport["headerError"]; headers: string[]; suggested: ImportMapping; sample: string[][]; totalRows: number } {
  let rows: string[][];
  try { rows = parseCsv(csvText); } catch { return { headerError: "MALFORMED", headers: [], suggested: {}, sample: [], totalRows: 0 }; }
  if (rows.length < 2) return { headerError: "EMPTY", headers: [], suggested: {}, sample: [], totalRows: 0 };
  const headers = rows[0].map((h) => cleanText(h).slice(0, 80));
  const total = rows.length - 1;
  return {
    headerError: total > MAX_IMPORT_ROWS ? "TOO_MANY_ROWS" : null, headers, suggested: suggestMapping(rows[0]),
    sample: rows.slice(1, 4).map((r) => headers.map((_, i) => cleanText(r[i] ?? "").slice(0, 60))), totalRows: total,
  };
}

export type ImportIssueCode =
  | "MISSING_NAME" | "INVALID_FIELD" | "INVALID_PHONE" | "INVALID_WEBSITE" | "INVALID_EMAIL" | "CONTACT_NAME_REQUIRED" | "CONTACT_INVALID"
  | "LANGUAGE_UNRECOGNIZED" | "SIZE_UNRECOGNIZED" | "INDUSTRY_UNRECOGNIZED" | "SOURCE_UNRECOGNIZED"
  | "DUPLICATE_IN_FILE" | "DUPLICATE_EXISTING" | "DUPLICATE_DO_NOT_CONTACT" | "ROW_TOO_LONG"
  | "TERRITORY_BLOCKED" | "INVALID_POSTAL" | "ADDRESS_INCOMPLETE" | "DUPLICATE_SOURCE_ID" | "ALREADY_IMPORTED" | "NEEDS_REVIEW" | "BRANCH_OF_EXISTING" | "LINKED_EXISTING" | "DNC_PROPAGATED";
export interface ImportIssue { row: number; field: string; code: ImportIssueCode; severity: "error" | "warning" | "skipped" }

export interface ImportCandidate {
  rowNumber: number;
  prospect: Omit<ProspectInput, "assignedStaffId">;
  contact: ContactInput | null;
  doNotContact: boolean;
  /** Source-supplied record id (verbatim, trimmed) when the file has one. */
  externalId: string | null;
  sourceUrl: string | null;
  addressQuality: AddressQuality;
  keys: MatchKey & { contactEmail: string | null; email: string | null };
}
export interface ParsedImport {
  headerError: "EMPTY" | "NO_NAME_COLUMN" | "TOO_MANY_ROWS" | "MALFORMED" | null;
  totalRows: number;
  candidates: ImportCandidate[];
  issues: ImportIssue[];
  ignoredColumns: number;
}

function mapLanguage(v: string): "FR" | "EN" | "UNKNOWN" | "?" {
  const f = fold(v);
  if (!f || ["unknown", "inconnu", "na", "n_a"].includes(f)) return "UNKNOWN";
  if (["fr", "french", "francais", "fra", "fre"].includes(f)) return "FR";
  if (["en", "english", "anglais", "eng"].includes(f)) return "EN";
  return "?";
}
const SIZE_MAP: Record<string, string> = { solo: "SOLO", "1": "SOLO", small: "SMALL", petit: "SMALL", medium: "MEDIUM", moyen: "MEDIUM", large: "LARGE", grand: "LARGE" };
function mapSize(v: string): string | null | "?" {
  const f = fold(v);
  if (!f) return null;
  if (SIZE_MAP[f]) return SIZE_MAP[f];
  const n = Number(f.split("_")[0]);
  if (Number.isFinite(n) && /^\d/.test(f)) return n <= 1 ? "SOLO" : n <= 5 ? "SMALL" : n <= 15 ? "MEDIUM" : "LARGE";
  return "?";
}
const INDUSTRY_MAP: Record<string, string> = {
  general_repair: "GENERAL_REPAIR", general: "GENERAL_REPAIR", mecanique: "GENERAL_REPAIR", mechanic: "GENERAL_REPAIR", repair: "GENERAL_REPAIR",
  tire_shop: "TIRE_SHOP", tire: "TIRE_SHOP", pneus: "TIRE_SHOP", tires: "TIRE_SHOP", body_shop: "BODY_SHOP", body: "BODY_SHOP", carrosserie: "BODY_SHOP",
  transmission: "TRANSMISSION", diagnostic: "DIAGNOSTIC", specialty: "SPECIALTY", specialise: "SPECIALTY", fleet: "FLEET", flotte: "FLEET", other: "OTHER", autre: "OTHER",
};
const SOURCE_MAP: Record<string, string> = {
  referral: "REFERRAL", reference: "REFERRAL", website: "WEBSITE", web: "WEBSITE", cold_outbound: "COLD_OUTBOUND", cold: "COLD_OUTBOUND", outbound: "COLD_OUTBOUND",
  event: "EVENT", evenement: "EVENT", directory: "DIRECTORY", repertoire: "DIRECTORY", partner: "PARTNER", partenaire: "PARTNER", import: "IMPORT", other: "OTHER", autre: "OTHER",
};
const truthy = (v: string) => ["1", "true", "yes", "y", "oui", "x", "dnc"].includes(fold(v));

export function parseProspectCsv(csvText: string, opts: { defaultSource?: string; mapping?: ImportMapping | null } = {}): ParsedImport {
  const empty = (headerError: ParsedImport["headerError"]): ParsedImport => ({ headerError, totalRows: 0, candidates: [], issues: [], ignoredColumns: 0 });
  let rows: string[][];
  try { rows = parseCsv(csvText); } catch { return empty("MALFORMED"); }
  if (rows.length < 2) return empty("EMPTY");
  const mapping = opts.mapping ? sanitizeMapping(opts.mapping, rows[0].length) : null;
  if (opts.mapping && !mapping) return empty("MALFORMED");
  const header = rows[0].map((h, i) => (mapping ? (mapping[String(i)] ?? null) : (suggestMapping(rows[0])[String(i)] ?? null)));
  if (!header.includes("name")) return empty("NO_NAME_COLUMN");
  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) return { ...empty("TOO_MANY_ROWS"), totalRows: dataRows.length };

  const issues: ImportIssue[] = [];
  const candidates: ImportCandidate[] = [];
  dataRows.forEach((cells, idx) => {
    const rowNumber = idx + 2; // spreadsheet row (header is row 1)
    const get = (field: string) => {
      const col = header.indexOf(field);
      return col >= 0 ? (cells[col] ?? "") : "";
    };
    if (cells.some((c) => c.length > 5000)) { issues.push({ row: rowNumber, field: "*", code: "ROW_TOO_LONG", severity: "error" }); return; }
    if (!cleanText(get("name"))) { issues.push({ row: rowNumber, field: "name", code: "MISSING_NAME", severity: "error" }); return; }

    const lang = mapLanguage(get("preferredLanguage"));
    if (lang === "?") issues.push({ row: rowNumber, field: "preferredLanguage", code: "LANGUAGE_UNRECOGNIZED", severity: "warning" });
    const size = mapSize(get("shopSize"));
    if (size === "?") issues.push({ row: rowNumber, field: "shopSize", code: "SIZE_UNRECOGNIZED", severity: "warning" });
    const industryRaw = fold(get("industry"));
    const industry = industryRaw ? (INDUSTRY_MAP[industryRaw] ?? null) : null;
    if (industryRaw && !industry) issues.push({ row: rowNumber, field: "industry", code: "INDUSTRY_UNRECOGNIZED", severity: "warning" });
    const sourceRaw = fold(get("source"));
    const source = sourceRaw ? (SOURCE_MAP[sourceRaw] ?? null) : null;
    if (sourceRaw && !source) issues.push({ row: rowNumber, field: "source", code: "SOURCE_UNRECOGNIZED", severity: "warning" });

    const parsed = prospectInputSchema.safeParse({
      name: get("name"), website: get("website"), address: get("address"), city: get("city"), province: get("province"),
      postalCode: get("postalCode"), phone: get("phone"), email: get("email"),
      industry: industry ?? "", shopSize: size === "?" || size === null ? "" : size,
      locationCount: get("locationCount").trim() || undefined, currentSoftware: get("currentSoftware"),
      source: source ?? opts.defaultSource ?? "IMPORT", sourceDetail: get("sourceDetail"),
      preferredLanguage: lang === "?" ? "UNKNOWN" : lang, tags: get("tags"), notes: get("notes"),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const code = issue.message === "INVALID_PHONE" ? "INVALID_PHONE" : issue.message === "INVALID_WEBSITE" ? "INVALID_WEBSITE"
          : issue.path[0] === "email" ? "INVALID_EMAIL" : "INVALID_FIELD";
        issues.push({ row: rowNumber, field: String(issue.path[0] ?? "*"), code, severity: "error" });
      }
      return;
    }
    const { assignedStaffId: _unused, ...prospect } = parsed.data; void _unused;

    let contact: ContactInput | null = null;
    const contactName = cleanText(get("contactName"));
    const contactEmail = get("contactEmail").trim(), contactPhone = get("contactPhone").trim();
    if (contactName || contactEmail || contactPhone) {
      const cl = mapLanguage(get("contactLanguage"));
      const c = contactName ? contactInputSchema.safeParse({
        name: contactName, title: get("contactTitle"), email: contactEmail, phone: contactPhone,
        isPrimary: true, isDecisionMaker: truthy(get("decisionMaker")),
        preferredLanguage: cl === "FR" || cl === "EN" ? cl : "",
      }) : null;
      if (!c) issues.push({ row: rowNumber, field: "contactName", code: "CONTACT_NAME_REQUIRED", severity: "warning" });
      else if (!c.success) issues.push({ row: rowNumber, field: "contact", code: "CONTACT_INVALID", severity: "warning" });
      else contact = c.data;
    }
    const addr = canonicalAddress(prospect);
    if (prospect.postalCode && !addr.postalKey) issues.push({ row: rowNumber, field: "postalCode", code: "INVALID_POSTAL", severity: "warning" });
    if (addr.quality === "UNKNOWN" || addr.quality === "INCOMPLETE") issues.push({ row: rowNumber, field: "address", code: "ADDRESS_INCOMPLETE", severity: "warning" });
    // Store the canonical postal when valid; keep the raw value otherwise (never invent).
    if (addr.postalKey) prospect.postalCode = addr.postalCode;
    const externalId = neutralizeFormula(cleanText(get("externalId"))).slice(0, 120) || null;
    const sourceUrlRaw = get("sourceUrl").trim();
    const sourceUrl = /^https?:\/\//i.test(sourceUrlRaw) && sourceUrlRaw.length <= 500 ? sourceUrlRaw.replace(/[\u0000-\u001F\u007F\s]/g, "") : null;
    candidates.push({
      rowNumber, prospect, contact, doNotContact: truthy(get("doNotContact")), externalId, sourceUrl, addressQuality: addr.quality,
      keys: {
        nameNormalized: normalizeBusinessName(prospect.name), cityKey: cityKey(prospect.city),
        websiteDomain: websiteDomain(prospect.website), phoneDigits: phoneDigits(prospect.phone),
        addressKey: addr.addressKey, postalKey: addr.postalKey,
        contactEmail: normalizeEmail(contact?.email), email: normalizeEmail(prospect.email),
      },
    });
  });
  const ignoredColumns = header.filter((h) => h === null).length;
  return { headerError: null, totalRows: dataRows.length, candidates, issues, ignoredColumns };
}

/** Idempotency key of a source record: its own id when the file has one, otherwise file hash + row number. */
export function recordKeyOf(c: Pick<ImportCandidate, "externalId" | "rowNumber">, fileHash: string): string {
  return c.externalId ? `id:${c.externalId}` : `row:${fileHash}:${c.rowNumber}`;
}
/** Content fingerprint of the business-level facts of a row (contact persons excluded). Same facts ⇒ same fingerprint. */
export function fingerprintOf(c: ImportCandidate): string {
  const p = c.prospect;
  return createHash("sha256").update(JSON.stringify([c.keys.nameNormalized, c.keys.addressKey, c.keys.cityKey, p.province, c.keys.postalKey, c.keys.phoneDigits, c.keys.websiteDomain, c.keys.email, c.doNotContact])).digest("hex").slice(0, 40);
}
/** Minimal, business-level snapshot kept with the observation for provenance. No contact persons, emails or raw payload. */
export function snapshotOf(c: ImportCandidate): Record<string, unknown> {
  const p = c.prospect;
  return {
    name: p.name, address: p.address, city: p.city, province: p.province, postalCode: p.postalCode, phone: p.phone, websiteDomain: c.keys.websiteDomain,
    hasEmail: !!c.keys.email, hasContact: !!c.contact, language: p.preferredLanguage, industry: p.industry, addressQuality: c.addressQuality, optOut: c.doNotContact,
  };
}

export interface ExistingProspectKey extends PoolEntry { assignedStaffId: string | null }
export interface ExistingSource { fingerprint: string; prospectId: string | null }

export type RowPlan =
  | { row: number; action: "CREATE"; branchOf: string[] }
  | { row: number; action: "ALREADY_IMPORTED" }
  | { row: number; action: "DUPLICATE_SOURCE_ID" }
  | { row: number; action: "LINK_EXACT"; target: string }
  | { row: number; action: "LINK_STRONG"; target: string; reasons: MatchReason[] }
  /** Strong match to an earlier row of the same file (target row number); resolved to a prospect id when written. */
  | { row: number; action: "LINK_IN_FILE"; targetRow: number; reasons: MatchReason[] }
  /** Ambiguous: held for a human. `target` is an existing prospect id or `row:<n>` for an earlier row of this file. */
  | { row: number; action: "REVIEW"; target: string; reasons: MatchReason[] };

/**
 * Sequential, deterministic plan for a whole file, shared by preview and confirm so both always agree.
 *  1. the same (record, content) seen before → ALREADY_IMPORTED (retries are no-ops);
 *  2. the same source record id seen before with changed content → LINK_EXACT (idempotent identity);
 *  3. otherwise branch-aware classification against existing prospects AND earlier rows of this file.
 * Rows never merge existing prospects with each other.
 */
export function planImport(
  candidates: ImportCandidate[], recordKeys: Map<number, string>, fingerprints: Map<number, string>,
  pool: readonly PoolEntry[], sources: ReadonlyMap<string, ExistingSource[]>,
): RowPlan[] {
  const live: PoolEntry[] = [...pool], seenRecord = new Set<string>(), plans: RowPlan[] = [];
  for (const c of candidates) {
    const rk = recordKeys.get(c.rowNumber)!, fp = fingerprints.get(c.rowNumber)!;
    const prior = sources.get(rk) ?? [];
    if (prior.some((x) => x.fingerprint === fp)) { plans.push({ row: c.rowNumber, action: "ALREADY_IMPORTED" }); continue; }
    if (c.externalId) {
      if (seenRecord.has(rk)) { plans.push({ row: c.rowNumber, action: "DUPLICATE_SOURCE_ID" }); continue; }
      seenRecord.add(rk);
      const linked = prior.find((x) => x.prospectId);
      if (linked) { plans.push({ row: c.rowNumber, action: "LINK_EXACT", target: linked.prospectId! }); continue; }
    }
    const r = classifyAgainstPool(c.keys, live);
    const inFile = (id: string) => (id.startsWith("row:") ? Number(id.slice(4)) : null);
    if (r.outcome === "STRONG") {
      const tr = inFile(r.strong!.id);
      plans.push(tr !== null ? { row: c.rowNumber, action: "LINK_IN_FILE", targetRow: tr, reasons: r.strong!.reasons } : { row: c.rowNumber, action: "LINK_STRONG", target: r.strong!.id, reasons: r.strong!.reasons });
    } else if (r.outcome === "AMBIGUOUS") {
      plans.push({ row: c.rowNumber, action: "REVIEW", target: r.ambiguous[0].id, reasons: r.ambiguous[0].reasons });
    } else {
      plans.push({ row: c.rowNumber, action: "CREATE", branchOf: r.branchOf });
      live.push({ id: `row:${c.rowNumber}`, ...c.keys, doNotContact: c.doNotContact });
    }
  }
  return plans;
}
