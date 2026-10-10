// Canonical address semantics for CRM prospects — pure (no DB). This is the SHARED CONTRACT between the Lead Engine
// (which owns address normalisation, quality and territory) and the Field Route Planner (which owns coordinates):
//   · `canonicalAddress()` is the only place that decides what a street/city/postal "means".
//   · `addressFingerprint` changes iff the physical address changes → geocoding can be invalidated by comparing it.
//   · `isRoutableAddress()` says whether an address is precise enough to be looked up/geocoded at all.
// Nothing here invents data: unknown parts stay null and lower the quality.
import { createHash } from "node:crypto";
import { cityKey, provinceCode } from "@/domain/sales-crm/territory";

export type AddressQuality = "UNKNOWN" | "INCOMPLETE" | "PARTIAL" | "COMPLETE";

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Canadian postal code: valid letters only (no D F I O Q U; W Z not first). Returns "A1A 1A1" or null. */
export function normalizePostal(value: string | null | undefined): string | null {
  const v = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/.test(v)) return null;
  return `${v.slice(0, 3)} ${v.slice(3)}`;
}
export function postalCompact(value: string | null | undefined): string | null {
  const n = normalizePostal(value);
  return n ? n.replace(" ", "") : null;
}

const SUFFIX: Record<string, string> = {
  rue: "rue", street: "st", avenue: "av", av: "av", ave: "av", boulevard: "blvd", boul: "blvd", blvd: "blvd", bd: "blvd", road: "rd", rd: "rd",
  chemin: "ch", ch: "ch", drive: "dr", dr: "dr", highway: "hwy", hwy: "hwy", autoroute: "aut", aut: "aut", route: "rte", rte: "rte", rang: "rang",
  place: "pl", pl: "pl", lane: "ln", ln: "ln", court: "ct", ct: "ct", crescent: "cres", cres: "cres", montee: "montee", impasse: "impasse", allee: "allee", terrasse: "terr",
};
const DIRECTION: Record<string, string> = { nord: "n", north: "n", n: "n", sud: "s", south: "s", s: "s", est: "e", east: "e", e: "e", ouest: "o", west: "o", o: "o", w: "o" };
const UNIT_WORDS = new Set(["suite", "ste", "bureau", "bur", "local", "unit", "unite", "apt", "app", "appartement", "porte", "etage", "floor", "fl", "rdc"]);

export interface StreetParts { civic: string | null; name: string; key: string }

/** "123, Boul. St-Laurent, Suite 4" → { civic: "123", name: "blvd saint laurent", key: "123 blvd saint laurent" }. Units are dropped. */
export function normalizeStreet(raw: string | null | undefined): StreetParts | null {
  let s = stripAccents(raw ?? "").toLowerCase().replace(/[#.,;()]/g, " ").replace(/['’`]/g, " ").replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  // Drop everything from a unit designator on ("suite 200", "bureau 3", "#12"-style digits right after it).
  const tokens0 = s.split(" ");
  const cut = tokens0.findIndex((t, i) => i > 0 && UNIT_WORDS.has(t) && !(t === "ste" && /^[a-z]/.test(tokens0[i + 1] ?? "") && !/^\d/.test(tokens0[i + 1] ?? "")));
  s = (cut > 0 ? tokens0.slice(0, cut) : tokens0).join(" ");
  const tokens = s.split(" ");
  let civic: string | null = null;
  if (/^\d+[a-z]?$/.test(tokens[0] ?? "")) civic = tokens.shift()!;
  else if (/^\d+$/.test(tokens[tokens.length - 1] ?? "") && tokens.length > 1) civic = tokens.pop()!; // "rue principale 123"
  const out: string[] = [];
  tokens.forEach((t, i) => {
    const next = tokens[i + 1];
    if ((t === "st" || t === "ste") && next !== undefined && !(next in DIRECTION && i + 2 >= tokens.length)) { out.push(t === "st" ? "saint" : "sainte"); return; } // St-Laurent
    if (i === tokens.length - 1 && t in DIRECTION && tokens.length > 1) { out.push(DIRECTION[t]); return; }
    if (t === "st") { out.push("st"); return; } // trailing "st" = street
    out.push(SUFFIX[t] ?? t);
  });
  const name = out.join(" ").trim();
  if (!name || !/[a-z]/.test(name)) return null;
  return { civic, name, key: civic ? `${civic} ${name}` : name };
}

export interface CanonicalAddress {
  street: string | null;
  /** civic + street name, comparable across spellings; null without a street. */
  addressKey: string | null;
  hasCivic: boolean;
  city: string | null;
  cityKey: string;
  province: string | null;
  postalCode: string | null;
  /** Compact postal ("H2X1Y4"); null when invalid or absent. */
  postalKey: string | null;
  quality: AddressQuality;
  /** Stable hash of the canonical address; null when there is no street. Changes iff the physical address changes. */
  fingerprint: string | null;
}

export function canonicalAddress(input: { address?: string | null; city?: string | null; province?: string | null; postalCode?: string | null }): CanonicalAddress {
  const street = normalizeStreet(input.address);
  const city = (input.city ?? "").trim() || null;
  const ck = cityKey(city);
  const prov = provinceCode(input.province);
  const postal = normalizePostal(input.postalCode);
  const hasStreet = !!street, hasCivic = !!street?.civic;
  const quality: AddressQuality =
    hasStreet && hasCivic && ck && prov && postal ? "COMPLETE"
    : hasStreet && hasCivic && (ck || postal) ? "PARTIAL"
    : hasStreet || ck || prov || postal ? "INCOMPLETE" : "UNKNOWN";
  const fingerprint = street ? createHash("sha256").update([street.key, ck, prov ?? "", postal ? postal.replace(" ", "") : ""].join("|")).digest("hex").slice(0, 32) : null;
  return {
    street: (input.address ?? "").trim() || null, addressKey: street?.key ?? null, hasCivic, city, cityKey: ck, province: prov,
    postalCode: postal ?? ((input.postalCode ?? "").trim() || null), postalKey: postal ? postal.replace(" ", "") : null, quality, fingerprint,
  };
}

/** Precise enough to look up on a map / put on a FIELD route (COMPLETE or PARTIAL with a civic number). */
export function isRoutableAddress(quality: AddressQuality): boolean { return quality === "COMPLETE" || quality === "PARTIAL"; }
