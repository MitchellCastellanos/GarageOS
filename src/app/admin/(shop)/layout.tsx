import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminChrome } from "@/components/layout/AdminChrome";
import { Toaster } from "sonner";
import { ADMIN, PLATFORM } from "@/lib/routes";
import { db } from "@/lib/db";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { AdminLocaleProvider } from "@/components/admin/AdminLocaleProvider";
import { getAccessibleShops } from "@/actions/locations";
import { can } from "@/lib/subscription";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect(ADMIN.login);
  }

  if (session.user.role === "SUPER_ADMIN") {
    redirect(PLATFORM.home);
  }

  if (!session.user.shopId) {
    redirect(ADMIN.login);
  }

  const [shop, locale, accessibleShops, inventoryEntitled, campaignsEntitled] = await Promise.all([
    db.shop.findUnique({
      where: { id: session.user.shopId },
      select: { name: true, logoUrl: true },
    }),
    getAdminLocale(),
    getAccessibleShops(),
    can(session.user.shopId, "inventory.manage"),
    can(session.user.shopId, "communications.campaigns"),
  ]);

  const lockedNavHrefs = [
    ...(inventoryEntitled ? [] : [ADMIN.inventory]),
    ...(campaignsEntitled ? [] : [ADMIN.campaigns]),
  ];

  return (
    <AdminLocaleProvider locale={locale}>
      {session.impersonation && (
        <ImpersonationBanner shopName={session.impersonation.shopName} startedByName={session.impersonation.startedByName} />
      )}
      <AdminChrome
        shopName={shop?.name}
        shopLogoUrl={shop?.logoUrl}
        userName={session.user.name}
        isOwner={session.user.role === "OWNER"}
        accessibleShops={accessibleShops}
        currentShopId={session.user.shopId}
        lockedNavHrefs={lockedNavHrefs}
      >
        {children}
      </AdminChrome>
      <Toaster position="bottom-right" richColors />
    </AdminLocaleProvider>
  );
}
