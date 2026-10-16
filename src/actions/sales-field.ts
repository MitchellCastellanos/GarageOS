"use server";

import { revalidatePath } from "next/cache";
import { PLATFORM } from "@/lib/routes";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { CrmError } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { geocodeOwnProspects } from "@/lib/sales-crm/location-service";
import { isMapStatus, parseBbox, parseRadius } from "@/domain/sales-crm/field-map";
import { getMapProspect, loadNearby, loadViewport, searchPlace, territorySummary } from "@/lib/sales-crm/field-map-service";
import { cancelRoute, recordMapVisit, completeRoute, saveRouteDraft, skipStop, startRoute, submitStopResult } from "@/lib/sales-crm/field-route-service";

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

// ---- Field Planner 2.0: territory map (read-only loaders + in-place visit result) ----

/** Viewport refresh: every prospect of the seller's book in the visible area, as markers or clusters. */
export async function loadFieldMapViewport(input: { bbox: unknown; zoom: number; statuses?: string[]; q?: string }) {
  const actor = await requireCrmActor("plan_field_routes");
  return crmAction(async () => {
    const bbox = parseBbox(input?.bbox);
    if (!bbox || typeof input.zoom !== "number" || !Number.isFinite(input.zoom)) throw new CrmError("INVALID");
    const statuses = (Array.isArray(input.statuses) ? input.statuses : []).filter(isMapStatus);
    return loadViewport(actor, { bbox, zoom: Math.max(0, Math.min(22, input.zoom)), statuses, q: typeof input.q === "string" ? input.q.trim().slice(0, 80) || undefined : undefined });
  });
}

export async function loadFieldNearby(input: { lat: number; lng: number; radiusM: number; statuses?: string[] }) {
  const actor = await requireCrmActor("plan_field_routes");
  return crmAction(async () => {
    const radius = parseRadius(input?.radiusM);
    if (!radius || !Number.isFinite(input.lat) || !Number.isFinite(input.lng)) throw new CrmError("INVALID");
    return loadNearby(actor, { lat: input.lat, lng: input.lng }, radius, (Array.isArray(input.statuses) ? input.statuses : []).filter(isMapStatus));
  });
}

export async function loadFieldSummary() {
  const actor = await requireCrmActor("plan_field_routes");
  return crmAction(async () => territorySummary(actor));
}

export async function searchFieldPlace(query: string) {
  const actor = await requireCrmActor("plan_field_routes");
  return crmAction(async () => ({ place: await searchPlace(actor, String(query ?? "")) }));
}

export async function loadFieldProspect(prospectId: string) {
  const actor = await requireCrmActor("plan_field_routes");
  return crmAction(async () => getMapProspect(actor, String(prospectId)));
}

/** Records the visit result for a prospect directly from the map (route stop updated too when the prospect is on the active route). */
export async function submitMapVisit(prospectId: string, payload: { outcome: string; submissionId: string; note?: string; nextAction?: string; followUpDate?: string; contactId?: string }) {
  const actor = await requireCrmActor("log_field_visits");
  return crmAction(async () => {
    const r = await recordMapVisit(actor, String(prospectId), payload);
    refresh();
    revalidatePath(PLATFORM.salesProspect(String(prospectId)));
    return r;
  });
}
