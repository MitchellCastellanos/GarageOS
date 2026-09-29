import { requireSuperAdmin } from "@/lib/permissions";
import { PlatformChrome } from "@/components/admin/PlatformChrome";
import { getPlatformPendingCount } from "@/actions/platform";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, pendingCounts] = await Promise.all([requireSuperAdmin(), getPlatformPendingCount()]);

  return (
    <PlatformChrome userName={session.user.name} pendingCounts={pendingCounts}>
      {children}
    </PlatformChrome>
  );
}
