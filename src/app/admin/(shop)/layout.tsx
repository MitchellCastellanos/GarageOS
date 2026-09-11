import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Toaster } from "sonner";
import { ADMIN, PLATFORM } from "@/lib/routes";
import { db } from "@/lib/db";

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

  const shop = await db.shop.findUnique({
    where: { id: session.user.shopId },
    select: { name: true, logoUrl: true },
  });

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Topbar
        shopName={shop?.name}
        shopLogoUrl={shop?.logoUrl}
        userName={session.user?.name}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 p-6 overflow-auto">{children}</main>
      </div>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
