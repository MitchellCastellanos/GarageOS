import { getShopForAdmin, getShopUsageSnapshot, getShopNotes, getShopAuditLogEntries } from "@/actions/platform";
import { db } from "@/lib/db";
import { getShopSmsAdminOverview } from "@/actions/platform-sms";
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

  const [usage, notes, auditLog, superAdmins, sms] = await Promise.all([
    getShopUsageSnapshot(id),
    getShopNotes(id),
    getShopAuditLogEntries(id),
    db.user.findMany({ where: { role: "SUPER_ADMIN" }, select: { id: true, name: true } }),
    getShopSmsAdminOverview(id),
  ]);

  const actorNames = Object.fromEntries(superAdmins.map((u) => [u.id, u.name]));

  return <ShopAdminPanel shop={shop} usage={usage} notes={notes} auditLog={auditLog} actorNames={actorNames} sms={sms} />;
}
