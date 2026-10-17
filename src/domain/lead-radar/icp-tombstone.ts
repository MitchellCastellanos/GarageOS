// Exclusion tombstone identity (pure). A tombstone must recognise the SAME business when a later release re-keys it (new source id), and must NEVER suppress a different
// independent business that merely shares a name, a brand reference or a website domain. The key is therefore the exact PLACE (street + civic number + city + province + postal)
// together with the normalised business name — hashed, so the tombstone stores no address. Without a street address there is no key: only the exact source id is remembered.
import { createHash } from "node:crypto";
import { canonicalAddress } from "@/domain/sales-crm/address";
import { OUTSIDE_ICP_REASON } from "@/domain/lead-radar/icp";

export const TOMBSTONE_REASON = "ICP_TOMBSTONE" as const;
export const TOMBSTONE_REKEYED_REASON = "ICP_TOMBSTONE_REKEYED" as const;

export function exclusionIdentityKey(c: { nameNormalized: string | null | undefined; address?: string | null; city?: string | null; province?: string | null; postalCode?: string | null }): string | null {
  const name = (c.nameNormalized ?? "").trim();
  const a = canonicalAddress({ address: c.address, city: c.city, province: c.province, postalCode: c.postalCode });
  if (!name || !a.fingerprint || !a.hasCivic) return null;
  return createHash("sha256").update(`${a.fingerprint}|${name}`).digest("hex").slice(0, 32);
}

export interface TombstoneLike { sourceRecordId: string; identityKey: string | null; status: string; reasonCode: string; category: string | null; brandId: string | null; registryVersion: number; releasedAt?: Date | null }
export type TombstoneDecision = { kind: "NONE" } | { kind: "OVERRIDE"; tomb: TombstoneLike } | { kind: "EXCLUDE"; tomb: TombstoneLike; rekeyed: boolean };

/** The exact source id decides first (a Super Admin release of that very record, or its tombstone). Otherwise the same exact place+name under another id: a released tombstone
 *  hands its human override to the re-keyed record, an active one excludes it again. */
export function decideTombstone(sourceRecordId: string, key: string | null, byId: ReadonlyMap<string, TombstoneLike>, byKey: ReadonlyMap<string, readonly TombstoneLike[]>): TombstoneDecision {
  const own = byId.get(sourceRecordId);
  if (own) return own.status === "ACTIVE" ? { kind: "EXCLUDE", tomb: own, rekeyed: false } : { kind: "OVERRIDE", tomb: own };
  const others = key ? byKey.get(key) ?? [] : [];
  const released = others.filter((t) => t.status !== "ACTIVE").sort((a, b) => (b.releasedAt?.getTime() ?? 0) - (a.releasedAt?.getTime() ?? 0))[0];
  if (released) return { kind: "OVERRIDE", tomb: released };
  const active = others.find((t) => t.status === "ACTIVE");
  return active ? { kind: "EXCLUDE", tomb: active, rekeyed: true } : { kind: "NONE" };
}

/** The reasons a tombstoned business carries on its candidate row (so every gate keeps excluding it even if the registry later changes). */
export function tombstoneReasons(t: TombstoneLike, rekeyed: boolean): string[] {
  return [OUTSIDE_ICP_REASON, ...(t.category ? [`ICP_${t.category}`] : []), ...(t.brandId ? [`ICP_BRAND_${t.brandId}`] : []), TOMBSTONE_REASON, ...(rekeyed ? [TOMBSTONE_REKEYED_REASON] : []), `ICP_REGISTRY_V${t.registryVersion}`];
}
/** Adds the durable-exclusion marker to a fresh ICP exclusion. */
export const withTombstoneMarker = (reasons: readonly string[]): string[] => (reasons.includes(TOMBSTONE_REASON) ? [...reasons] : [...reasons.filter((r) => !r.startsWith("ICP_REGISTRY_V")), TOMBSTONE_REASON, ...reasons.filter((r) => r.startsWith("ICP_REGISTRY_V"))]);
