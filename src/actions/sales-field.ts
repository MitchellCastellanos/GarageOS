"use server";

import { revalidatePath } from "next/cache";
import { PLATFORM } from "@/lib/routes";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { CrmError } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { geocodeOwnProspects } from "@/lib/sales-crm/location-service";
import { cancelRoute, completeRoute, saveRouteDraft, skipStop, startRoute, submitStopResult } from "@/lib/sales-crm/field-route-service";

// Thin, capability-gated entry points. Every one re-resolves the actor from the session and delegates to the services, which
// re-check route ownership and prospect assignment: hiding a link is never the access control.

function refresh(routeId?: string) {
  revalidatePath(PLATFORM.salesField);
  if (routeId) revalidatePath(PLATFORM.salesFieldRoute(routeId));
  revalidatePath(PLATFORM.salesTasks);
}

/** Resolves map positions for the seller's own prospects (no-op while no geocoding provider is configured). */
export async function requestGeocoding(prospectIds: string[]) {
  const actor = await requireCrmActor("plan_field_routes");
  return crmAction(async () => {
    if (!Array.isArray(prospectIds) || prospectIds.some((i) => typeof i !== "string")) throw new CrmError("INVALID");
    const results = await geocodeOwnProspects(actor, prospectIds);
    refresh();
    return { results };
  });
}

export interface SaveRoutePayload { routeId?: string; clientRequestId: string; plannedDate: string; name?: string; areaLabel?: string; prospectIds: string[]; expectedVersion?: number }

export async function saveFieldRoute(payload: SaveRoutePayload) {
  const actor = await requireCrmActor("plan_field_routes");
  return crmAction(async () => {
    if (!payload || !Array.isArray(payload.prospectIds) || payload.prospectIds.some((i) => typeof i !== "string")) throw new CrmError("INVALID");
    const r = await saveRouteDraft(actor, {
      routeId: payload.routeId || undefined, clientRequestId: String(payload.clientRequestId ?? ""), plannedDate: String(payload.plannedDate ?? ""), name: payload.name, areaLabel: payload.areaLabel,
      prospectIds: payload.prospectIds, expectedVersion: typeof payload.expectedVersion === "number" ? payload.expectedVersion : undefined,
    });
    refresh(r.routeId);
    return r;
  });
}

export async function startFieldRoute(routeId: string) {
  const actor = await requireCrmActor("plan_field_routes");
  return crmAction(async () => { await startRoute(actor, String(routeId)); refresh(routeId); return {}; });
}
export async function completeFieldRoute(routeId: string) {
  const actor = await requireCrmActor("log_field_visits");
  return crmAction(async () => { await completeRoute(actor, String(routeId)); refresh(routeId); return {}; });
}
export async function cancelFieldRoute(routeId: string) {
  const actor = await requireCrmActor("plan_field_routes");
  return crmAction(async () => { await cancelRoute(actor, String(routeId)); refresh(routeId); return {}; });
}

export async function submitFieldVisit(stopId: string, payload: { outcome: string; submissionId: string; note?: string; nextAction?: string; followUpDate?: string; contactId?: string }) {
  const actor = await requireCrmActor("log_field_visits");
  return crmAction(async () => {
    const r = await submitStopResult(actor, String(stopId), payload);
    refresh();
    return { activityId: r.activityId, replayed: r.replayed, routeComplete: r.routeComplete };
  });
}

export async function skipFieldStop(stopId: string, reason?: string) {
  const actor = await requireCrmActor("log_field_visits");
  return crmAction(async () => { const r = await skipStop(actor, String(stopId), reason ?? null); refresh(); return r; });
}
