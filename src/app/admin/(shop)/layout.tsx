import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminChrome } from "@/components/layout/AdminChrome";
import { Toaster } from "sonner";
import { ADMIN, PLATFORM } from "@/lib/routes";
import { db } from "@/lib/db";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { AdminLocaleProvider } from "@/components/admin/AdminLocaleProvider";

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

  const [shop, locale] = await Promise.all([
    db.shop.findUnique({
      where: { id: session.user.shopId },
      select: { name: true, logoUrl: true },
    }),
    getAdminLocale(),
  ]);

  return (
    <AdminLocaleProvider locale={locale}>
      <AdminChrome
        shopName={shop?.name}
        shopLogoUrl={shop?.logoUrl}
        userName={session.user.name}
        isOwner={session.user.role === "OWNER"}
      >
        {children}
      </AdminChrome>
      <Toaster position="bottom-right" richColors />
    </AdminLocaleProvider>
  );
}
