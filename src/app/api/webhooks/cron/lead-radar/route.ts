import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runAutomationTick } from "@/lib/lead-radar/automation";
import { runDiscoveryMaintenance } from "@/lib/lead-radar/worker";
import { seedDiscoveredContactsIfEnabled } from "@/lib/sales-comms/contact-readiness";

// Lead Radar automation worker: qualify → import → assign → assess outreach eligibility → (pilot) enroll. Idempotent and safe to overlap (single-runner lease).
// It is a no-op unless BOTH the live-discovery switch and the automation master switch are on, and it never sends email: the sales worker
// (/api/webhooks/cron/sales) is the only thing that turns enrollments into messages, under its own kill switch.
// Scheduled every 15 minutes by .github/workflows/lead-radar-cron.yml, with a daily Vercel cron (vercel.json) as the safety net.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Discovery housekeeping first (recover stalled worker runs, detect a new Overture release, queue an opted-in province). Independent of the automation master switch
  // (it only needs live discovery) and a failure here must never block the automation tick below.
  let discovery: { skipped?: string; newRelease: boolean; scheduled: number; stalled: number } | { error: string };
  try { const m = await runDiscoveryMaintenance(); discovery = { skipped: m.skipped, newRelease: m.newRelease, scheduled: m.scheduled.length, stalled: m.stalled.recovered + m.stalled.failed }; }
  catch (e) { console.error("[lead-radar] discovery maintenance failed", e instanceof Error ? e.message : "unknown"); discovery = { error: "MAINTENANCE_FAILED" }; }
  const r = await runAutomationTick({ trigger: "CRON" });
  // Record published business emails as PENDING discovered contacts (staging only: no CRM contact, no basis, no sending). Needs the automation + eligibility switches.
  try { await seedDiscoveredContactsIfEnabled(); } catch (e) { console.error("[lead-radar] contact discovery failed", e instanceof Error ? e.message : "unknown"); }
  // Counters and codes only — never business data.
  return NextResponse.json({ status: r.status, reason: r.reason ?? null, runId: r.runId ?? null, discovery }, { status: r.status === "FAILED" ? 500 : 200 });
}
