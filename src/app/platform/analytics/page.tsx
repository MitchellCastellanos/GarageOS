import { requireSuperAdmin } from "@/lib/permissions";
import { getLast24HoursSeries, getDailySeries, getRangeBreakdown } from "@/lib/platform/analytics";
import { AnalyticsDashboard } from "@/components/admin/AnalyticsDashboard";

const VALID_RANGES = [7, 30, 90] as const;

export default async function PlatformAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireSuperAdmin();
  const { days: daysParam } = await searchParams;
  const days = VALID_RANGES.includes(Number(daysParam) as (typeof VALID_RANGES)[number]) ? Number(daysParam) : 30;

  const [last24h, daily, breakdown] = await Promise.all([
    getLast24HoursSeries(),
    getDailySeries(days),
    getRangeBreakdown(days),
  ]);

  return <AnalyticsDashboard last24h={last24h} daily={daily} breakdown={breakdown} days={days} />;
}
