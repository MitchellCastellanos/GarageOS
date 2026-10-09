import { cleanText, parseCsv, MAX_IMPORT_ROWS } from "@/domain/sales-crm/csv";
import { normalizeBusinessName, normalizeCity, normalizeEmail, phoneDigits, websiteDomain } from "@/domain/sales-crm/normalize";
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

export type ImportIssueCode =
  | "MISSING_NAME" | "INVALID_FIELD" | "INVALID_PHONE" | "INVALID_WEBSITE" | "INVALID_EMAIL" | "CONTACT_NAME_REQUIRED" | "CONTACT_INVALID"
  | "LANGUAGE_UNRECOGNIZED" | "SIZE_UNRECOGNIZED" | "INDUSTRY_UNRECOGNIZED" | "SOURCE_UNRECOGNIZED"
  | "DUPLICATE_IN_FILE" | "DUPLICATE_EXISTING" | "DUPLICATE_DO_NOT_CONTACT" | "ROW_TOO_LONG";
export interface ImportIssue { row: number; field: string; code: ImportIssueCode; severity: "error" | "warning" | "skipped" }

export interface ImportCandidate {
  rowNumber: number;
  prospect: Omit<ProspectInput, "assignedStaffId">;
  contact: ContactInput | null;
  doNotContact: boolean;
  keys: { nameNormalized: string; city: string; websiteDomain: string | null; phoneDigits: string | null; contactEmail: string | null; email: string | null };
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

export function parseProspectCsv(csvText: string, opts: { defaultSource?: string } = {}): ParsedImport {
  const empty = (headerError: ParsedImport["headerError"]): ParsedImport => ({ headerError, totalRows: 0, candidates: [], issues: [], ignoredColumns: 0 });
  let rows: string[][];
  try { rows = parseCsv(csvText); } catch { return empty("MALFORMED"); }
  if (rows.length < 2) return empty("EMPTY");
  const header = rows[0].map((h) => ALIAS_LOOKUP.get(fold(h)) ?? null);
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
    candidates.push({
      rowNumber, prospect, contact, doNotContact: truthy(get("doNotContact")),
      keys: {
        nameNormalized: normalizeBusinessName(prospect.name), city: normalizeCity(prospect.city),
        websiteDomain: websiteDomain(prospect.website), phoneDigits: phoneDigits(prospect.phone),
        contactEmail: normalizeEmail(contact?.email), email: normalizeEmail(prospect.email),
      },
    });
  });
  const ignoredColumns = header.filter((h) => h === null).length;
  return { headerError: null, totalRows: dataRows.length, candidates, issues, ignoredColumns };
}

/** Two rows are the same business if they share a website domain, a phone number, or a name+city. */
export function dedupeWithinFile(candidates: ImportCandidate[]): { kept: ImportCandidate[]; issues: ImportIssue[] } {
  const seen = { domain: new Set<string>(), phone: new Set<string>(), nameCity: new Set<string>() };
  const kept: ImportCandidate[] = [], issues: ImportIssue[] = [];
  for (const c of candidates) {
    const { websiteDomain: d, phoneDigits: p, nameNormalized: n, city } = c.keys;
    const nameCity = n ? `${n}|${city}` : null;
    if ((d && seen.domain.has(d)) || (p && seen.phone.has(p)) || (nameCity && seen.nameCity.has(nameCity))) {
      issues.push({ row: c.rowNumber, field: "name", code: "DUPLICATE_IN_FILE", severity: "skipped" });
      continue;
    }
    if (d) seen.domain.add(d);
    if (p) seen.phone.add(p);
    if (nameCity) seen.nameCity.add(nameCity);
    kept.push(c);
  }
  return { kept, issues };
}

/** Pure matcher used against rows already in the database (the DB layer supplies `existing`). */
export interface ExistingKey { id: string; nameNormalized: string; city: string; websiteDomain: string | null; phoneDigits: string | null; doNotContact: boolean }
export function findExistingMatch(c: ImportCandidate, existing: ExistingKey[]): ExistingKey | null {
  return existing.find((e) =>
    (c.keys.websiteDomain && e.websiteDomain === c.keys.websiteDomain) ||
    (c.keys.phoneDigits && e.phoneDigits === c.keys.phoneDigits) ||
    (c.keys.nameNormalized && e.nameNormalized === c.keys.nameNormalized && e.city === c.keys.city)) ?? null;
}
