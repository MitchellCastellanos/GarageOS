// Branch-aware duplicate classification — pure (no DB). A shared domain, phone number or chain name is NOT proof of
// the same business: franchises and multi-location shops share all three. Only an agreeing PHYSICAL PLACE (address /
// postal) plus an agreeing name is treated as "the same business"; everything uncertain goes to a human.
//
//   STRONG    → same business, link without creating a prospect (never merges two existing prospects)
//   AMBIGUOUS → a human decides: same business, or a distinct branch?
//   NEW       → create a prospect; `branchOf` lists existing locations of the same chain (informational warning)

export interface MatchKey {
  nameNormalized: string;
  cityKey: string;
  websiteDomain: string | null;
  phoneDigits: string | null;
  /** civic + street ("123 rue principale") or null. */
  addressKey: string | null;
  /** Compact valid postal ("H2X1Y4") or null. */
  postalKey: string | null;
}
export interface PoolEntry extends MatchKey { id: string; doNotContact: boolean }

export type MatchReason = "NAME_ADDRESS" | "NAME_POSTAL" | "NAME_CITY_PHONE" | "NAME_CITY_DOMAIN" | "SAME_PHONE" | "SAME_DOMAIN" | "SAME_NAME_CITY" | "SAME_ADDRESS_OTHER_NAME";
export interface PoolMatch { id: string; reasons: MatchReason[] }
export interface Classification {
  outcome: "NEW" | "STRONG" | "AMBIGUOUS";
  strong: PoolMatch | null;
  ambiguous: PoolMatch[];
  /** Existing locations sharing a chain signal (name/domain/phone) but at a different physical place. */
  branchOf: string[];
}

type Place = "SAME" | "DIFFERENT" | "UNKNOWN";

/** Compares physical places conservatively. Different civic address, different postal or different city ⇒ DIFFERENT. */
export function comparePlace(a: MatchKey, b: MatchKey): Place {
  if (a.addressKey && b.addressKey) {
    if (a.addressKey === b.addressKey) return a.cityKey && b.cityKey && a.cityKey !== b.cityKey ? "DIFFERENT" : "SAME";
    return "DIFFERENT";
  }
  if (a.postalKey && b.postalKey) return a.postalKey === b.postalKey ? "SAME" : "DIFFERENT";
  if (a.cityKey && b.cityKey && a.cityKey !== b.cityKey) return "DIFFERENT";
  return "UNKNOWN";
}

export function classifyAgainstPool(c: MatchKey, pool: readonly PoolEntry[]): Classification {
  const phoneCount = new Map<string, number>(), domainCount = new Map<string, number>();
  for (const p of pool) {
    if (p.phoneDigits) phoneCount.set(p.phoneDigits, (phoneCount.get(p.phoneDigits) ?? 0) + 1);
    if (p.websiteDomain) domainCount.set(p.websiteDomain, (domainCount.get(p.websiteDomain) ?? 0) + 1);
  }
  const strong: PoolMatch[] = [], ambiguous: PoolMatch[] = [], branchOf: string[] = [];
  for (const p of pool) {
    const sameName = !!c.nameNormalized && c.nameNormalized === p.nameNormalized;
    const samePhone = !!c.phoneDigits && c.phoneDigits === p.phoneDigits;
    const sameDomain = !!c.websiteDomain && c.websiteDomain === p.websiteDomain;
    // Same name and the same (possibly unknown-on-both-sides) city; with no location info at all two same-named rows cannot be told apart.
    const sameNameCity = sameName && c.cityKey === p.cityKey;
    const place = comparePlace(c, p);
    const chainSignal = sameName || samePhone || sameDomain;
    if (!chainSignal && !(place === "SAME" && c.addressKey)) continue;

    if (place === "SAME") {
      if (sameName) strong.push({ id: p.id, reasons: [c.addressKey && p.addressKey ? "NAME_ADDRESS" : "NAME_POSTAL"] });
      else if (samePhone || sameDomain) ambiguous.push({ id: p.id, reasons: ["SAME_ADDRESS_OTHER_NAME", ...(samePhone ? ["SAME_PHONE" as const] : []), ...(sameDomain ? ["SAME_DOMAIN" as const] : [])] });
      // same address, different name, nothing else shared → another tenant of the same building: not a duplicate
      continue;
    }
    if (place === "DIFFERENT") { if (chainSignal) branchOf.push(p.id); continue; }
    // UNKNOWN place (address data missing on at least one side): decide cautiously.
    const phoneUnique = samePhone && phoneCount.get(c.phoneDigits!) === 1, domainUnique = sameDomain && domainCount.get(c.websiteDomain!) === 1;
    if (sameNameCity && (phoneUnique || domainUnique)) {
      strong.push({ id: p.id, reasons: [phoneUnique ? "NAME_CITY_PHONE" : "NAME_CITY_DOMAIN"] });
    } else if (sameNameCity || samePhone || sameDomain) {
      ambiguous.push({ id: p.id, reasons: [...(sameNameCity ? ["SAME_NAME_CITY" as const] : []), ...(samePhone ? ["SAME_PHONE" as const] : []), ...(sameDomain ? ["SAME_DOMAIN" as const] : [])] });
    }
  }
  if (strong.length === 1 && ambiguous.length === 0) return { outcome: "STRONG", strong: strong[0], ambiguous: [], branchOf };
  // Two strong matches means the CRM already holds a duplicate pair: never pick one silently.
  const review = [...strong, ...ambiguous];
  if (review.length) return { outcome: "AMBIGUOUS", strong: null, ambiguous: review, branchOf };
  return { outcome: "NEW", strong: null, ambiguous: [], branchOf };
}
