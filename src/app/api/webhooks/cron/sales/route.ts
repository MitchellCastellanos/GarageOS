import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { providerSideEffectsEnabled } from "@/lib/provider-policy";
import { processDueEnrollments } from "@/lib/sales-comms/sequences";
import { dispatchDue } from "@/lib/sales-comms/dispatcher";
import { getCommsSettings } from "@/lib/sales-comms/settings";

// Sales communications worker: (1) turn due sequence enrollments into queued messages, (2) send everything that is due
// (queued, scheduled, retries, meeting reminders). Idempotent and safe to overlap — see lib/sales-comms/dispatcher.ts.
//
// vercel.json schedules this once a day (Hobby plan limit). Meeting reminders and scheduled sends are only as punctual
// as this cadence: for minute-level punctuality call this URL every 5–10 minutes from the Vercel Pro cron or an external
// scheduler with `Authorization: Bearer $CRON_SECRET`. The composer's "Send now" and a booking's confirmation do NOT wait
// for the cron — they are dispatched immediately.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Like campaigns: with external effects unauthorised nothing is touched (no enrolment advances, no attempts burned).
  if (!providerSideEffectsEnabled()) return NextResponse.json({ skipped: true, reason: "provider_side_effects_disabled" });
  const settings = await getCommsSettings();
  if (!settings.sendingEnabled) return NextResponse.json({ skipped: true, reason: "sales_sending_disabled" });
  const sequences = await processDueEnrollments({ limit: 50 });
  const dispatched = await dispatchDue({ limit: 25, paceMs: 550 });
  return NextResponse.json({ ok: true, sequences, dispatched });
}
