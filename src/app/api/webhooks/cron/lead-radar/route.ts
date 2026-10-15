import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runAutomationTick } from "@/lib/lead-radar/automation";

// Lead Radar automation worker: qualify → import → assign → assess outreach eligibility → (pilot) enroll. Idempotent and safe to overlap (single-runner lease).
// It is a no-op unless BOTH the live-discovery switch and the automation master switch are on, and it never sends email: the sales worker
// (/api/webhooks/cron/sales) is the only thing that turns enrollments into messages, under its own kill switch.
// Scheduled every 15 minutes by .github/workflows/lead-radar-cron.yml, with a daily Vercel cron (vercel.json) as the safety net.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await runAutomationTick({ trigger: "CRON" });
  // Counters and codes only — never business data.
  return NextResponse.json({ status: r.status, reason: r.reason ?? null, runId: r.runId ?? null }, { status: r.status === "FAILED" ? 500 : 200 });
}
