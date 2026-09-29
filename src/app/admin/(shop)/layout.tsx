import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminChrome } from "@/components/layout/AdminChrome";
import { Toaster } from "sonner";
import { ADMIN, PLATFORM } from "@/lib/routes";
import { db } from "@/lib/db";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { AdminLocaleProvider } from "@/components/admin/AdminLocaleProvider";
import { getAccessibleShops } from "@/actions/locations";
import { canView, getEffectiveSubscription } from "@/lib/subscription";
import { hasUnreadSupportMessage } from "@/actions/support";
import { hasUnreadInboxThreads } from "@/lib/communications/inbox";
import { getMyStaffNotifications } from "@/actions/staff-notifications";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { EmailVerificationBanner } from "@/components/admin/EmailVerificationBanner";
import type { PlanBadge } from "@/components/layout/Topbar";
import { daysUntil } from "@/domain/subscription-state";
import { SubscriptionBanner, type SubscriptionBannerData } from "@/components/admin/SubscriptionBanner";


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

  const [shop, locale, accessibleShops, inventoryEntitled, campaignsEntitled, currentUser, hasUnreadSupport, hasUnreadInbox, staffNotifications] = await Promise.all([
    db.shop.findUnique({
      where: { id: session.user.shopId },
      select: { name: true, logoUrl: true, onboardingCompletedAt: true },
    }),
    getAdminLocale(),
    getAccessibleShops(),
    canView(session.user.shopId, "inventory.manage"),
    canView(session.user.shopId, "communications.campaigns"),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, emailVerified: true },
    }),
    hasUnreadSupportMessage(session.user.shopId),
    hasUnreadInboxThreads(session.user.shopId),
    getMyStaffNotifications(),
  ]);

  // Solo el dueño completa el asistente de arranque — no bloquea al staff
  // invitado a un taller cuyo dueño todavía no terminó de configurarlo.
  if (session.user.role === "OWNER" && !shop?.onboardingCompletedAt) {
    redirect(ADMIN.onboarding);
  }

  const isOwner = session.user.role === "OWNER";
  let planBadge: PlanBadge | null = null;
  let billingBanner: SubscriptionBannerData | null = null;
  if (isOwner) {
    const sub = await getEffectiveSubscription(session.user.shopId);
    const trialDays = sub.isTrialing && sub.trialEndsAt ? Math.max(daysUntil(sub.trialEndsAt), 0) : 0;
    planBadge = {
      plan: sub.plan ?? sub.subscribedPlan,
      state:
        sub.accessState === "RESTRICTED" || sub.accessState === "SETUP_REQUIRED"
          ? sub.isTrialExpired
            ? "trialExpired"
            : "free"
          : sub.accessState === "PAST_DUE"
            ? "pastDue"
            : sub.accessState === "TRIALING"
              ? "trialing"
              : "active",
      trialDays,
    };
    if (sub.accessState === "RESTRICTED") {
      billingBanner = { kind: "restricted", hasPlan: sub.subscribedPlan != null };
    } else if (sub.accessState === "PAST_DUE" && sub.plan) {
      billingBanner = { kind: "pastDue", plan: sub.plan };
    } else if (sub.accessState === "TRIALING" && sub.plan && sub.trialEndsAt) {
      billingBanner = {
        kind: "trial",
        plan: sub.plan,
        daysLeft: Math.max(daysUntil(sub.trialEndsAt), 0),
        chargeDate: sub.trialEndsAt.toISOString(),
        amountCad: sub.nextCharge?.amountCad ?? null,
        interval: sub.billingInterval,
        hasPaymentMethod: sub.hasStripeSubscription,
      };
    }
  }

  const lockedNavHrefs = [
    ...(inventoryEntitled ? [] : [ADMIN.inventory]),
    ...(campaignsEntitled ? [] : [ADMIN.campaigns]),
  ];

  // Punto inicial en Citas (reserva/cancelación web sin ver) — el resto de la
  // sesión lo actualiza en vivo el propio Sidebar por Pusher.
  const hasUnreadAppointments = staffNotifications.notifications.some(
    (n) => !n.readAt && n.href?.startsWith(ADMIN.appointments)
  );

  return (
    <AdminLocaleProvider locale={locale}>
      {session.impersonation && (
        <ImpersonationBanner shopName={session.impersonation.shopName} startedByName={session.impersonation.startedByName} />
      )}
      {currentUser && !currentUser.emailVerified && <EmailVerificationBanner email={currentUser.email} />}
      {billingBanner && <SubscriptionBanner data={billingBanner} />}
      <AdminChrome
        shopName={shop?.name}
        shopLogoUrl={shop?.logoUrl}
        userName={session.user.name}
        accessibleShops={accessibleShops}
        currentShopId={session.user.shopId}
        lockedNavHrefs={lockedNavHrefs}
        hasUnreadSupport={hasUnreadSupport}
        hasUnreadInbox={hasUnreadInbox}
        hasUnreadAppointments={hasUnreadAppointments}
        planBadge={planBadge}
        userId={session.user.id}
        initialNotifications={staffNotifications.notifications}
        initialUnreadNotifications={staffNotifications.unreadCount}
      >
        {children}
      </AdminChrome>
      <Toaster position="bottom-right" richColors />
    </AdminLocaleProvider>
  );
}
