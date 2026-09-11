import { getPlatformOverview } from "@/actions/platform";
import { PlatformOverview } from "@/components/admin/PlatformOverview";

export default async function AdminPage() {
  const shops = await getPlatformOverview();
  return <PlatformOverview shops={shops} />;
}
