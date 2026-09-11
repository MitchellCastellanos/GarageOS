import { getShopForAdmin } from "@/actions/platform";
import { ShopAdminPanel } from "@/components/admin/ShopAdminPanel";
import { notFound } from "next/navigation";

export default async function PlatformShopPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const shop = await getShopForAdmin(id);
  if (!shop) notFound();
  return <ShopAdminPanel shop={shop} />;
}
