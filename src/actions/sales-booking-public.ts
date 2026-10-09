"use server";

import { headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { loadPublicSlots, manageSlots, publicCancel, publicReschedule, submitPublicBooking, type PublicBookingRequest } from "@/lib/sales-comms/public-booking";
import { confirmUnsubscribe } from "@/lib/sales-comms/unsubscribe";

// PUBLIC server actions (no session). Every one is rate limited by IP inside the lib, validates all input again, and
// returns only the minimal DTOs defined in lib/sales-comms/public-booking.ts.
const ip = async () => clientIpFromHeaders(await headers());

export async function publicSlotsAction(token: string, durationMinutes: number) {
  return loadPublicSlots(String(token), Number(durationMinutes), await ip());
}

export async function publicBookAction(req: PublicBookingRequest) {
  return submitPublicBooking({
    token: String(req.token), startsAt: String(req.startsAt), durationMinutes: Number(req.durationMinutes), type: req.type, name: String(req.name ?? ""), email: String(req.email ?? ""),
    phone: req.phone ? String(req.phone) : undefined, address: req.address ? String(req.address) : undefined, timezone: String(req.timezone ?? ""), language: req.language === "FR" ? "FR" : "EN",
    notes: req.notes ? String(req.notes).slice(0, 1000) : undefined, website: req.website ? String(req.website) : undefined, renderedAt: Number(req.renderedAt) || undefined,
  }, await ip());
}

export async function manageSlotsAction(token: string) { return manageSlots(String(token), await ip()); }
export async function manageRescheduleAction(token: string, startsAt: string) { return publicReschedule(String(token), String(startsAt), await ip()); }
export async function manageCancelAction(token: string, reason?: string) { return publicCancel(String(token), await ip(), reason ? String(reason).slice(0, 300) : undefined); }
export async function unsubscribeAction(token: string) { return confirmUnsubscribe(String(token), await ip()); }
