import { requireSuperAdmin } from "@/lib/permissions";
import { getPlatformOverview, getPlatformGrowth } from "@/actions/platform";
import { PlatformOverview } from "@/components/admin/PlatformOverview";
import { PlatformGrowthSummary } from "@/components/admin/PlatformGrowthSummary";

export default async function AdminPage() {
  await requireSuperAdmin(); // platform pages other than /platform/sales are Super Admin only
  const [shops, growth] = await Promise.all([getPlatformOverview(), getPlatformGrowth()]);
  return (
    <div className="space-y-8">
      <PlatformGrowthSummary growth={growth} />
      <PlatformOverview shops={shops} />
    </div>
  );
}
