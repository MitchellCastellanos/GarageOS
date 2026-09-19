import { requireSuperAdmin } from "@/lib/permissions";
import { PlatformChrome } from "@/components/admin/PlatformChrome";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSuperAdmin();

  return <PlatformChrome userName={session.user.name}>{children}</PlatformChrome>;
}
