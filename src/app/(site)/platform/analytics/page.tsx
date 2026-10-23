import { requireSuperAdmin } from "@/lib/permissions";
import { getLast24HoursSeries, getDailySeries, getDailySeriesBetween, getRangeBreakdown } from "@/lib/platform/analytics";
import { getAnalyticsPanels } from "@/lib/platform/analytics-panels";
import { parseRange } from "@/lib/platform/analytics-panels-core";
import { AnalyticsDashboard } from "@/components/admin/AnalyticsDashboard";
import { AnalyticsPanels } from "@/components/admin/AnalyticsPanels";

export default async function PlatformAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; from?: string; to?: string }>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  // 7/30/90 presets (default 30) or a validated custom from/to; anything invalid falls back to 30 days and says so.
  const range = parseRange(params);
  const custom = range.kind === "custom";

  const [last24h, daily, breakdown, panels] = await Promise.all([
    getLast24HoursSeries(),
    custom ? getDailySeriesBetween(range.from, range.to) : getDailySeries(range.days),
    getRangeBreakdown(custom ? { from: range.from, to: range.to } : range.days),
    getAnalyticsPanels(range),
  ]);

  return (
    <>
      <AnalyticsDashboard last24h={last24h} daily={daily} breakdown={breakdown} days={range.days} customRange={custom ? { from: range.fromDay, to: range.toDay } : undefined} />
      <AnalyticsPanels range={range} data={panels} />
    </>
  );
}
