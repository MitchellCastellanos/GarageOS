import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { retentionApplyEnabled, runPageViewRetention } from "@/lib/platform/analytics-retention";

// Daily retention check for first-party analytics (13 months, subject to legal review). Deletes ONLY when ANALYTICS_RETENTION_APPLY=true;
// otherwise it counts and records a dry run in the platform audit log. Bounded batches; an unfinished run continues on the next invocation.
// Response and audit metadata contain counts and dates only.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runPageViewRetention();
    return NextResponse.json({ ok: true, applyEnabled: retentionApplyEnabled(), ...result });
  } catch (err) {
    console.error("[cron] analytics retention failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ ok: false, error: "retention failed" }, { status: 500 });
  }
}
