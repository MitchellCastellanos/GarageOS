import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ADMIN, PLATFORM } from "@/lib/routes";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { AdminLocaleProvider } from "@/components/admin/AdminLocaleProvider";
import { GarageOSAppIcon } from "@/components/marketing/GarageOSLogo";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect(ADMIN.login);
  if (session.user.role === "SUPER_ADMIN") redirect(PLATFORM.home);
  if (!session.user.shopId) redirect(ADMIN.login);
  // El asistente configura datos del taller (fiscal, booking, etc.) —
  // solo el dueño puede completarlo, igual que el resto de Configuración.
  if (session.user.role !== "OWNER") redirect(ADMIN.dashboard);

  const [shop, locale] = await Promise.all([
    db.shop.findUnique({ where: { id: session.user.shopId }, select: { onboardingCompletedAt: true } }),
    getAdminLocale(),
  ]);
  if (shop?.onboardingCompletedAt) redirect(ADMIN.dashboard);

  return (
    <AdminLocaleProvider locale={locale}>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="flex-shrink-0 py-4 flex justify-center border-b border-slate-200 bg-white">
          <GarageOSAppIcon className="w-9 h-9" />
        </header>
        <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-8 sm:py-12">
          <div className="w-full max-w-xl">{children}</div>
        </main>
      </div>
      <Toaster position="bottom-right" richColors />
    </AdminLocaleProvider>
  );
}
