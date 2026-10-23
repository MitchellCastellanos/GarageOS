import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { RETENTION_TABLES, retentionApplyEnabled, runAnalyticsRetention } from "@/lib/platform/analytics-retention";

// Daily retention check for first-party analytics (13 months, subject to legal review) over PageView AND AnalyticsEvent. Deletes ONLY when
// ANALYTICS_RETENTION_APPLY=true; otherwise it counts and records a dry run in the platform audit log (one entry per table). Bounded batches
// and one shared time budget; an unfinished run continues on the next invocation. Response and audit metadata contain counts and dates only.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const outcomes = await runAnalyticsRetention();
    const tables: Record<string, unknown> = {};
    let failed = false;
    for (const t of RETENTION_TABLES) {
      const o = outcomes[t];
      if (o.ok) tables[t] = o.result;
      else {
        failed = true;
        tables[t] = { error: o.error };
      }
    }
    return NextResponse.json({ ok: !failed, applyEnabled: retentionApplyEnabled(), tables }, { status: failed ? 500 : 200 });
  } catch (err) {
    console.error("[cron] analytics retention failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ ok: false, error: "retention failed" }, { status: 500 });
  }
}
