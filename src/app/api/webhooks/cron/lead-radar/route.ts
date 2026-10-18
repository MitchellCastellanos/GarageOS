import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runAutomationTick } from "@/lib/lead-radar/automation";
import { readAutomation } from "@/lib/lead-radar/automation";
import { getCommsSettings } from "@/lib/sales-comms/settings";
import { runDiscoveryMaintenance } from "@/lib/lead-radar/worker";
import { seedDiscoveredContactsIfEnabled } from "@/lib/sales-comms/contact-readiness";

// Lead Radar automation worker: qualify → import → assign → assess outreach eligibility → (pilot) enroll. Idempotent and safe to overlap (single-runner lease).
// It is a no-op unless BOTH the live-discovery switch and the automation master switch are on, and it never sends email: the sales worker
// (/api/webhooks/cron/sales) is the only thing that turns enrollments into messages, under its own kill switch.
// Scheduled every 15 minutes by .github/workflows/lead-radar-cron.yml, with a daily Vercel cron (vercel.json) as the safety net.
export const maxDuration = 60;

// Least privilege: LEAD_RADAR_CRON_SECRET (GitHub Actions caller) authorizes ONLY this endpoint; CRON_SECRET stays accepted for Vercel's daily cron.
const authorized = (request: Request) => isAuthorizedCronRequest(request, process.env.LEAD_RADAR_CRON_SECRET) || isAuthorizedCronRequest(request);

/** Counts, codes and milliseconds only (never a name, address, URL or id): numbers and short strings per stage, one nested level of numbers (reason tallies). */
function summarize(counters: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = {};
  for (const [stage, v] of Object.entries(counters ?? {})) {
    if (typeof v === "number") { out[stage] = v; continue; }
    if (!v || typeof v !== "object") continue;
    const flat: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (typeof x === "number" || typeof x === "boolean" || (typeof x === "string" && x.length <= 40)) flat[k] = x;
      else if (x && typeof x === "object" && !Array.isArray(x)) {
        const nums = Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, n]) => typeof n === "number" || typeof n === "boolean" || (typeof n === "string" && n.length <= 40)).slice(0, 12));
        if (Object.keys(nums).length) flat[k] = nums;
      }
    }
    out[stage] = flat;
  }
  return out;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Discovery housekeeping first (recover stalled worker runs, detect a new Overture release, queue an opted-in province). Independent of the automation master switch
  // (it only needs live discovery) and a failure here must never block the automation tick below.
  let discovery: { skipped?: string; newRelease: boolean; scheduled: number; stalled: number } | { error: string };
  try { const m = await runDiscoveryMaintenance(); discovery = { skipped: m.skipped, newRelease: m.newRelease, scheduled: m.scheduled.length, stalled: m.stalled.recovered + m.stalled.failed }; }
  catch (e) { console.error("[lead-radar] discovery maintenance failed", e instanceof Error ? e.message : "unknown"); discovery = { error: "MAINTENANCE_FAILED" }; }
  const r = await runAutomationTick({ trigger: "CRON" });
  // Switch states and codes only (no names, addresses or ids): what the tick saw, so a stall is diagnosable from the caller's log without database access.
  let state: Record<string, unknown> | null = null;
  try {
    const [a, comms] = await Promise.all([readAutomation(), getCommsSettings()]);
    state = {
      enabled: a.enabled, pausedReason: a.pausedReason, qualify: a.qualifyEnabled, import: a.importEnabled, assign: a.assignEnabled, evidence: a.evidenceEnabled, evidenceBatch: a.evidenceBatch,
      importProvinces: a.importProvinces.length, rolloutEnabled: a.rolloutEnabled, rolloutPaused: a.rolloutPaused, rolloutHalt: a.rolloutHaltCode ? `${a.rolloutHaltProvince ?? ""}:${a.rolloutHaltCode}` : null,
      eligibility: a.eligibilityEnabled, pilot: a.pilotEnabled, autoCaslActive: a.autoCaslActive, sendingEnabled: comms.sendingEnabled, automatedSending: comms.automatedSendingEnabled,
    };
  } catch { state = null; }
  // Record published business emails as PENDING discovered contacts (staging only: no CRM contact, no basis, no sending). Needs live discovery + the automation switch; independent of the eligibility stage.
  try { await seedDiscoveredContactsIfEnabled(); } catch (e) { console.error("[lead-radar] contact discovery failed", e instanceof Error ? e.message : "unknown"); }
  // Counters and codes only — never business data.
  return NextResponse.json({ status: r.status, reason: r.reason ?? null, runId: r.runId ?? null, discovery, state, stages: summarize(r.counters) }, { status: r.status === "FAILED" ? 500 : 200 });
}
