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
import { hasUnreadSupportMessage } from "@/actions/support";
import { hasUnreadInboxThreads } from "@/lib/communications/inbox";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { EmailVerificationBanner } from "@/components/admin/EmailVerificationBanner";

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

  const [shop, locale, accessibleShops, inventoryEntitled, campaignsEntitled, currentUser, hasUnreadSupport, hasUnreadInbox] = await Promise.all([
    db.shop.findUnique({
      where: { id: session.user.shopId },
      select: { name: true, logoUrl: true, onboardingCompletedAt: true },
    }),
    getAdminLocale(),
    getAccessibleShops(),
    can(session.user.shopId, "inventory.manage"),
    can(session.user.shopId, "communications.campaigns"),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, emailVerified: true },
    }),
    hasUnreadSupportMessage(session.user.shopId),
    hasUnreadInboxThreads(session.user.shopId),
  ]);

  // Solo el dueño completa el asistente de arranque — no bloquea al staff
  // invitado a un taller cuyo dueño todavía no terminó de configurarlo.
  if (session.user.role === "OWNER" && !shop?.onboardingCompletedAt) {
    redirect(ADMIN.onboarding);
  }

  const lockedNavHrefs = [
    ...(inventoryEntitled ? [] : [ADMIN.inventory]),
    ...(campaignsEntitled ? [] : [ADMIN.campaigns]),
  ];

  return (
    <AdminLocaleProvider locale={locale}>
      {session.impersonation && (
        <ImpersonationBanner shopName={session.impersonation.shopName} startedByName={session.impersonation.startedByName} />
      )}
      {currentUser && !currentUser.emailVerified && <EmailVerificationBanner email={currentUser.email} />}
      <AdminChrome
        shopName={shop?.name}
        shopLogoUrl={shop?.logoUrl}
        userName={session.user.name}
        accessibleShops={accessibleShops}
        currentShopId={session.user.shopId}
        lockedNavHrefs={lockedNavHrefs}
        hasUnreadSupport={hasUnreadSupport}
        hasUnreadInbox={hasUnreadInbox}
      >
        {children}
      </AdminChrome>
      <Toaster position="bottom-right" richColors />
    </AdminLocaleProvider>
  );
}
