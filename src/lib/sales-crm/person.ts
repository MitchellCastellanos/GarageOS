import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type Db = typeof db | Prisma.TransactionClient;

/** Same human behind two platform accounts? Independent review compares PEOPLE: the account, an explicit Super Admin link (`User.personKey`), or a shared VERIFIED recovery mailbox. */
export const PERSON_KEY_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export async function personTokens(userIds: readonly string[], client: Db = db): Promise<Map<string, Set<string>>> {
  const ids = [...new Set(userIds.filter((x) => !!x))];
  const out = new Map<string, Set<string>>(ids.map((id) => [id, new Set([`u:${id}`])]));
  if (!ids.length) return out;
  const users = await client.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, personKey: true, platformSalesStaff: { select: { recoveryEmail: true, recoveryEmailVerifiedAt: true } } },
  });
  for (const u of users) {
    const t = out.get(u.id)!;
    if (u.personKey) t.add(`k:${u.personKey.trim().toLowerCase()}`);
    const s = u.platformSalesStaff;
    if (s?.recoveryEmail && s.recoveryEmailVerifiedAt) t.add(`r:${s.recoveryEmail.trim().toLowerCase()}`);
  }
  return out;
}

const intersects = (a: Set<string>, b: Set<string>) => { for (const x of a) if (b.has(x)) return true; return false; };

/** Which of `otherUserIds` are the same person as `userId` (includes the same account). Fails closed when an id is unknown to the directory: only the id itself is compared. */
export async function sameAsPerson(userId: string, otherUserIds: readonly string[], client: Db = db): Promise<Set<string>> {
  const tokens = await personTokens([userId, ...otherUserIds], client);
  const mine = tokens.get(userId) ?? new Set([`u:${userId}`]);
  return new Set(otherUserIds.filter((o) => o === userId || (tokens.has(o) && intersects(mine, tokens.get(o)!))));
}

/** Platform accounts (Super Admins and sales staff) with their current person key, for the Super Admin link panel. */
export async function listPlatformPeople(client: Db = db) {
  const rows = await client.user.findMany({
    where: { OR: [{ role: "SUPER_ADMIN" }, { platformSalesStaff: { isNot: null } }] },
    select: { id: true, name: true, email: true, role: true, personKey: true, platformSalesStaff: { select: { role: true, status: true } } },
    orderBy: [{ name: "asc" }],
  });
  return rows.map((u) => ({ id: u.id, name: u.name, email: u.email, superAdmin: u.role === "SUPER_ADMIN", staffRole: u.platformSalesStaff?.role ?? null, personKey: u.personKey }));
}
