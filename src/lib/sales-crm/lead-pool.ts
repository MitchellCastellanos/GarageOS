import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canonicalAddress } from "@/domain/sales-crm/address";
import type { MatchKey } from "@/domain/sales-crm/dedupe";
import type { ExistingProspectKey } from "@/domain/sales-crm/import";
import { cityKey } from "@/domain/sales-crm/territory";

/**
 * Existing prospects (active, archived and do-not-contact alike) that could be the same business as any of `keys`.
 * Matching itself runs in the pure `classifyAgainstPool`; this only narrows the candidate set with indexed lookups.
 * Rows from before the Lead Engine have no stored addressKey/postalKey, so they are derived from address text here.
 */
export async function loadMatchPool(keys: MatchKey[], client: Prisma.TransactionClient | typeof db = db): Promise<ExistingProspectKey[]> {
  const uniq = <T,>(v: (T | null)[]) => [...new Set(v.filter((x): x is T => x !== null && x !== ""))];
  const domains = uniq(keys.map((k) => k.websiteDomain)), phones = uniq(keys.map((k) => k.phoneDigits));
  const names = uniq(keys.map((k) => k.nameNormalized)), addrs = uniq(keys.map((k) => k.addressKey)), postals = uniq(keys.map((k) => k.postalKey));
  const or: Prisma.CrmProspectWhereInput[] = [];
  if (domains.length) or.push({ websiteDomain: { in: domains } });
  if (phones.length) or.push({ phoneDigits: { in: phones } });
  if (names.length) or.push({ nameNormalized: { in: names } });
  if (addrs.length) or.push({ addressKey: { in: addrs } });
  if (postals.length) or.push({ postalKey: { in: postals } });
  if (!or.length) return [];
  const rows = await client.crmProspect.findMany({
    where: { OR: or },
    select: { id: true, nameNormalized: true, city: true, address: true, province: true, postalCode: true, websiteDomain: true, phoneDigits: true, doNotContact: true, assignedStaffId: true, addressKey: true, postalKey: true },
  });
  return rows.map((r) => {
    const a = r.addressKey === null && r.postalKey === null ? canonicalAddress(r) : null;
    return {
      id: r.id, nameNormalized: r.nameNormalized, cityKey: cityKey(r.city), websiteDomain: r.websiteDomain, phoneDigits: r.phoneDigits,
      addressKey: r.addressKey ?? a?.addressKey ?? null, postalKey: r.postalKey ?? a?.postalKey ?? null, doNotContact: r.doNotContact, assignedStaffId: r.assignedStaffId,
    };
  });
}
