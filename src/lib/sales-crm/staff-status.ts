import { db } from "@/lib/db";

/** Leaf module (imports only the DB) so auth.ts can use it without an import cycle. */
export async function salesStaffStatus(userId: string): Promise<"INVITED" | "ACTIVE" | "INACTIVE" | null> {
  const staff = await db.platformSalesStaff.findUnique({ where: { userId }, select: { status: true } });
  return staff?.status ?? null;
}
export async function isActiveSalesStaffUser(userId: string): Promise<boolean> {
  return (await salesStaffStatus(userId)) === "ACTIVE";
}
