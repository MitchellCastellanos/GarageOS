import "server-only";
import { db } from "@/lib/db";
import { classifyPageType, type CtaId } from "@/lib/analytics/contract";
import { hashVisitor } from "@/lib/privacy/visitor-hash";

// Call-to-action clicks on PUBLIC pages (Analytics v2). Fire-and-forget: the endpoint always answers 204 and never delays navigation.
// Stores only the allowlisted id, the normalised path, locale, a derived page type and the daily pseudonymous visitor hash.
// Separate from the sales-video attribution (CrmVideoEvent), which concerns known prospects.

const BOT_UA = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|pingdom|uptimerobot|headlesschrome|lighthouse|ahrefsbot|semrushbot|mj12bot|dotbot/i;
/** At most one identical (visitor, cta, path) event per minute. */
export const EVENT_DEDUPE_MS = 60_000;

export interface TrackCtaEventInput {
  ctaId: CtaId;
  /** Already validated and normalised by parseEventPayload. */
  path: string;
  locale: "en" | "fr";
  ip: string;
  userAgent: string;
  now?: Date;
}

export async function trackCtaEvent(input: TrackCtaEventInput): Promise<void> {
  if (BOT_UA.test(input.userAgent)) return;
  const now = input.now ?? new Date();
  const visitorHash = hashVisitor(input.ip, input.userAgent, { now });
  try {
    const recent = await db.analyticsEvent.findFirst({
      where: { type: "CTA_CLICK", ctaId: input.ctaId, path: input.path, visitorHash, createdAt: { gte: new Date(now.getTime() - EVENT_DEDUPE_MS) } },
      select: { id: true },
    });
    if (recent) return;
    await db.analyticsEvent.create({
      data: { type: "CTA_CLICK", ctaId: input.ctaId, path: input.path.slice(0, 300), locale: input.locale, pageType: classifyPageType(input.path), visitorHash },
    });
  } catch (e) {
    console.error("[platform/analytics-events] trackCtaEvent failed:", e instanceof Error ? e.name : "unknown");
  }
}
