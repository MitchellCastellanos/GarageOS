import { requireShopSession } from "@/lib/permissions";

export async function getShopId(): Promise<string> {
  const session = await requireShopSession();
  return session.user.shopId!;
}
