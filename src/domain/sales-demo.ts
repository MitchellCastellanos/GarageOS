import { z } from "zod";
import type { Plan } from "@/config/entitlements";

export const demoPlanSchema = z.enum(["CORE", "PRO", "COMPLETE"]);
const optionalText = (max: number) => z.string().trim().max(max).default("");
const optionalEmail = z.union([z.literal(""), z.email().max(254)]).default("");
export const prospectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  address: optionalText(255), phone: optionalText(30), email: optionalEmail,
  contactName: optionalText(100), contactEmail: optionalEmail, contactPhone: optionalText(30),
  preferredLanguage: z.enum(["FR", "EN"]).default("FR"),
});
export interface DemoLike {
  id: string; shopId: string; status: string; expiresAt: Date; currentPlan: Plan;
}
export interface DemoSessionLike {
  user: { id: string; shopId?: string | null; role: string };
  impersonation?: { salesDemoId?: string; shopId: string; startedByUserId: string; expiresAt: number } | null;
}
export const DEMO_DURATION_MS = 30 * 86400_000;
export function isDemoAvailable(demo: DemoLike, now = new Date()): boolean {
  return ["PREPARING", "ACTIVE"].includes(demo.status) && demo.expiresAt.getTime() > now.getTime();
}
export function isDemoSession(session: DemoSessionLike | null, demo: DemoLike, now = new Date()): boolean {
  const claim = session?.impersonation;
  return !!session && !!claim && claim.salesDemoId === demo.id && claim.shopId === demo.shopId &&
    session.user.shopId === demo.shopId && claim.startedByUserId === session.user.id &&
    claim.expiresAt > now.getTime() && isDemoAvailable(demo, now);
}
