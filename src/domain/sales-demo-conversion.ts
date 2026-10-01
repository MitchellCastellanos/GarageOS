import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { demoPlanSchema } from "@/domain/sales-demo";

// Same 24-hour lifetime as the platform verification flow. GET never consumes a link.
export const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;
export const activationRequestSchema = z.object({
  ownerName: z.string().trim().min(1).max(100),
  ownerEmail: z.email().max(254).transform((s) => s.toLowerCase()),
  plan: demoPlanSchema,
  interval: z.enum(["MONTHLY", "YEARLY"]),
  retainScenario: z.literal("yes"),
});
export const ownerPasswordSchema = z.string().min(8).max(128);
export function activationToken() { return randomBytes(32).toString("hex"); }
export function activationHash(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("ACTIVATION_INVALID");
  return createHash("sha256").update(token).digest("hex");
}
export function canLinkOwner(user: { shopId: string | null; role: string } | null, shopId: string) {
  return !user || (user.shopId === shopId && user.role === "OWNER");
}
export function hasConversionEvidence(sub: { stripeSubscriptionId: string | null; stripeCustomerId: string | null; plan: string | null; status: string }) {
  return !!sub.stripeSubscriptionId && !!sub.stripeCustomerId && !!sub.plan && ["TRIALING", "ACTIVE"].includes(sub.status);
}
