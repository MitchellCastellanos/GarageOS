// National Lead Radar → existing CRM import (pure). Approved candidates are turned into the SAME canonical CSV rows the Sales CRM
// importer already parses, so validation, normalisation, dedupe keys, territory and observation handling are the existing ones —
// there is no second import path. Nothing here ever sets a sending basis, consent, owner or contact person.
import { toCsv } from "@/domain/sales-crm/csv";

export const LEAD_RADAR_SOURCE_KEY = "overture-places";
export const IMPORT_HEADERS = ["name", "website", "address", "city", "province", "postalCode", "phone", "email", "industry", "externalId", "source", "sourceDetail", "tags"] as const;

/** "+15146750503" → "514-675-0503". The CSV writer defuses a leading "+" (formula injection), which would corrupt an E.164 number. */
export function phoneForCsv(phone: string | null): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  const n = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return n.length === 10 ? `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}` : n.length >= 10 ? n : "";
}

export interface BridgeCandidate {
  id: string; sourceRecordId: string; name: string; website: string | null; address: string | null; city: string | null; province: string | null;
  postalCode: string | null; phone: string | null; email: string | null; industry: string | null; lastSeenRelease: string;
}
/** Row i of the CSV is spreadsheet row i + 2 (the importer's numbering): returned order is the mapping back to candidate ids. */
export function candidatesToImportCsv(cands: readonly BridgeCandidate[]): { csv: string; rowToCandidate: Map<number, string> } {
  const rows: unknown[][] = [[...IMPORT_HEADERS]];
  const rowToCandidate = new Map<number, string>();
  cands.forEach((c, i) => {
    rows.push([c.name, c.website ?? "", c.address ?? "", c.city ?? "", c.province ?? "", c.postalCode ?? "", phoneForCsv(c.phone), c.email ?? "", c.industry ?? "", c.sourceRecordId, "DIRECTORY", `Overture Maps ${c.lastSeenRelease}`.slice(0, 120), "lead-radar"]);
    rowToCandidate.set(i + 2, c.id);
  });
  return { csv: toCsv(rows), rowToCandidate };
}

export const LAWFUL_SOURCE_NOTE = "Overture Maps Foundation places dataset; licences verified per record (permissive allow-list). Human-approved via National Lead Radar.";
export const MAX_IMPORT_APPROVALS = 400;
