import "server-only";
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getAppUrl } from "@/config/app";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { randomToken } from "@/domain/sales-comms/tokens";
import { CrmError, requireScopedProspect } from "@/lib/sales-crm/prospects";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { getPublishedVideo } from "@/lib/platform-video";
import { activeSuppressions } from "@/lib/sales-comms/suppression";
import { bookingUrl, ensureProspectLink, resolvePublicLink } from "@/lib/sales-comms/booking-links";
import {
  TIMELINE_EVENT_TYPES, VIDEO_ACTIVITY_EVENT, VIDEO_KINDS, VIDEO_LINK_TTL_DAYS, VIDEO_TOKEN_RE, VIEW_KEY_RE,
  decideClientEvent, extractWatchLinks, furthestProgress, isClientEventType, linkIsUsable, watchUrl,
  type ClientEventType, type VideoEventType, type VideoKind, type VideoLang,
} from "@/domain/sales-video";

/** Mints (or re-uses) the opaque attribution link for one (seller, prospect, contact, video, language). No scope check: callers do it. */
export async function mintVideoLink(args: { staffId: string; userId: string; prospectId: string; contactId: string | null; kind: VideoKind; language: VideoLang }) {
  // Only a PUBLISHED video that is allowed for outreach can be inserted — never a placeholder.
  const video = await getPublishedVideo(args.kind, args.language, "outreach");
  if (!video) throw new CrmError("VIDEO_UNAVAILABLE");
  const now = new Date();
  const existing = await db.crmVideoLink.findFirst({
    where: { staffId: args.staffId, prospectId: args.prospectId, contactId: args.contactId, videoKey: args.kind, language: args.language, revokedAt: null, expiresAt: { gt: new Date(now.getTime() + 7 * 86_400_000) } },
    orderBy: { createdAt: "desc" },
  });
  const link = existing ?? await db.crmVideoLink.create({
    data: { token: randomToken(), staffId: args.staffId, prospectId: args.prospectId, contactId: args.contactId, videoKey: args.kind, language: args.language, createdByUserId: args.userId, expiresAt: new Date(now.getTime() + VIDEO_LINK_TTL_DAYS * 86_400_000) },
  });
  if (!existing) await writeCrmAudit({ actorUserId: args.userId, action: "VIDEO_LINK_CREATED", entityType: "CrmVideoLink", entityId: link.id, prospectId: args.prospectId, staffId: args.staffId, metadata: { kind: args.kind, language: args.language } });
  return { url: watchUrl(getAppUrl(), args.language, args.kind, link.token), title: video.title, thumbnailUrl: video.thumbnailUrl, kind: args.kind, language: args.language };
}

/** The seller inserts a video in the composer: prospect/contact must be inside the seller's own scope. */
export async function videoLinkFor(actor: PlatformSalesActor, args: { prospectId: string; contactId: string | null; kind: VideoKind; language: VideoLang }) {
  if (!actor.staffId) throw new CrmError("NO_SENDER_IDENTITY");
  const prospect = await requireScopedProspect(actor, args.prospectId);
  if (args.contactId) {
    const c = await db.crmContact.findFirst({ where: { id: args.contactId, prospectId: prospect.id, archivedAt: null }, select: { id: true } });
    if (!c) throw new CrmError("NOT_FOUND");
  }
  return mintVideoLink({ staffId: actor.staffId, userId: actor.userId, prospectId: prospect.id, contactId: args.contactId, kind: args.kind, language: args.language });
}

/** Template variable support: the tracked landing link for the commercial in the message language, or null when nothing is published. */
export async function templateVideoLink(args: { staffId: string; userId: string; prospectId: string; contactId: string | null; language: VideoLang }) {
  try { return await mintVideoLink({ ...args, kind: "commercial" }); } catch { return null; }
}

/** Public resolution of a token: usable link + seller still active. Everything else is an indistinguishable null (no oracle). */
export async function resolveVideoLink(token: string | null | undefined, now = new Date()) {
  if (!token || !VIDEO_TOKEN_RE.test(token)) return null;
  const link = await db.crmVideoLink.findUnique({ where: { token }, include: { staff: { select: { status: true, bookingEnabled: true } } } });
  if (!link || !linkIsUsable(link, now) || link.staff.status !== "ACTIVE") return null;
  return link;
}

export type RecordResult = "RECORDED" | "IGNORED" | "INVALID";

/**
 * Records one browser-reported event. Never throws to the caller. Rules: valid opaque token, human-looking request, real
 * prospect that has not opted out, plausible sequence (decideClientEvent), one row per (link, type) with a distinct-view counter.
 * The first occurrence of the important types also writes a readable prospect-timeline entry.
 */
export async function recordClientVideoEvent(args: { token: string; type: string; viewKey: string; now?: Date }): Promise<RecordResult> {
  const now = args.now ?? new Date();
  if (!isClientEventType(args.type) || !VIEW_KEY_RE.test(args.viewKey)) return "INVALID";
  const link = await resolveVideoLink(args.token, now);
  if (!link) return "INVALID";
  return recordForLink(link, args.type, args.viewKey, now);
}

async function recordForLink(link: NonNullable<Awaited<ReturnType<typeof resolveVideoLink>>>, type: VideoEventType, viewKey: string, now: Date, extra: Record<string, unknown> = {}): Promise<RecordResult> {
  const prospect = await db.crmProspect.findUnique({ where: { id: link.prospectId }, select: { id: true, doNotContact: true } });
  if (!prospect || prospect.doNotContact) return "IGNORED";
  if (link.contactId) {
    const c = await db.crmContact.findUnique({ where: { id: link.contactId }, select: { doNotContact: true, emailNormalized: true } });
    if (c?.doNotContact) return "IGNORED";
    // An unsubscribed / suppressed address (global, all sellers) is not measured either.
    if (c?.emailNormalized && (await activeSuppressions([c.emailNormalized])).size > 0) return "IGNORED";
  }
  const prior = await db.crmVideoEvent.findMany({ where: { linkId: link.id } });
  if (type !== "CTA_DEMO" && type !== "CTA_TRIAL") {
    const kind = (link.videoKey === "teaser" ? "teaser" : "commercial") as VideoKind;
    const d = decideClientEvent({ type: type as ClientEventType, viewKey, now, videoSeconds: VIDEO_KINDS[kind].seconds, prior: prior.map((p) => ({ type: p.type, firstAt: p.firstAt, lastAt: p.lastAt, lastViewKey: p.lastViewKey })) });
    if (!d.accept) return "IGNORED";
  }
  const existing = prior.find((p) => p.type === type);
  try {
    if (existing) {
      if (existing.count >= 500) return "IGNORED";
      await db.crmVideoEvent.update({ where: { id: existing.id }, data: { count: { increment: existing.lastViewKey === viewKey ? 0 : 1 }, lastAt: now, lastViewKey: viewKey } });
      return "RECORDED";
    }
    await db.$transaction(async (tx) => {
      await tx.crmVideoEvent.create({ data: { linkId: link.id, type, firstAt: now, lastAt: now, lastViewKey: viewKey } });
      if (TIMELINE_EVENT_TYPES.includes(type)) {
        await tx.crmActivity.create({ data: {
          prospectId: link.prospectId, contactId: link.contactId, type: "SYSTEM", authorUserId: link.createdByUserId, occurredAt: now,
          metadata: { event: VIDEO_ACTIVITY_EVENT[type], videoKey: link.videoKey, language: link.language, linkId: link.id, ...extra } as Prisma.InputJsonValue,
        } });
      }
    });
    return "RECORDED";
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return "IGNORED"; // lost a race with an identical event: already counted
    throw e;
  }
}

/** Server-side CTA click (the redirect route). Where to send the visitor, with attribution; never blocks on a tracking failure. */
export async function recordCtaAndTarget(args: { token: string | null; cta: "demo" | "trial"; viewKey: string | null; human: boolean; lang: VideoLang }) {
  const fallback = args.cta === "trial" ? "/get-started" : "/contact";
  if (!args.token) return { to: fallback };
  try {
    const link = await resolveVideoLink(args.token);
    if (!link) return { to: fallback };
    let to = fallback;
    if (args.cta === "demo" && link.staff.bookingEnabled) {
      const bl = await ensureProspectLink({ staffId: link.staffId, prospectId: link.prospectId, contactId: link.contactId, opportunityId: null, language: link.language === "FR" ? "FR" : "EN", actorUserId: link.createdByUserId });
      if (await resolvePublicLink(bl.token)) to = bookingUrl(bl.token, link.language === "FR" ? "FR" : "EN");
    }
    if (args.human) {
      const played = await db.crmVideoEvent.findFirst({ where: { linkId: link.id, type: { in: ["PLAY", "PROGRESS_25", "PROGRESS_50", "PROGRESS_75", "COMPLETE"] } }, select: { id: true } });
      await recordForLink(link, args.cta === "demo" ? "CTA_DEMO" : "CTA_TRIAL", args.viewKey && VIEW_KEY_RE.test(args.viewKey) ? args.viewKey : "server", new Date(), { afterWatching: !!played });
    }
    return { to };
  } catch {
    return { to: fallback };
  }
}

/** Called when a message is queued: remembers which email carried which link (so the CRM can name the email/sequence). */
export async function linkMessageToVideos(messageId: string, bodyText: string): Promise<void> {
  try {
    const found = extractWatchLinks(bodyText, getAppUrl());
    for (const f of found) {
      const link = await db.crmVideoLink.findUnique({ where: { token: f.token }, select: { id: true } });
      if (link) await db.crmVideoLinkMessage.upsert({ where: { linkId_messageId: { linkId: link.id, messageId } }, create: { linkId: link.id, messageId }, update: {} });
    }
  } catch { /* attribution bookkeeping must never fail a send */ }
}

/**
 * Compact per-prospect summary for the CRM page (caller has already passed the prospect scope check): one row per
 * (video, language), merging every link of that pair (a link is re-issued as it nears expiry; the history must not split).
 */
export async function videoSummaryForProspect(prospectId: string) {
  const links = await db.crmVideoLink.findMany({ where: { prospectId }, orderBy: { createdAt: "desc" }, take: 30, include: { events: true } });
  const groups = new Map<string, { kind: VideoKind; language: VideoLang; createdAt: Date; types: VideoEventType[]; last: Date | null }>();
  for (const l of links) {
    const kind = (l.videoKey === "teaser" ? "teaser" : "commercial") as VideoKind;
    const key = `${kind}:${l.language}`;
    const g = groups.get(key) ?? { kind, language: l.language as VideoLang, createdAt: l.createdAt, types: [], last: null };
    if (l.createdAt < g.createdAt) g.createdAt = l.createdAt; // first time this video was sent
    for (const e of l.events) { g.types.push(e.type as VideoEventType); if (!g.last || e.lastAt > g.last) g.last = e.lastAt; }
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ id: `${g.kind}:${g.language}`, kind: g.kind, language: g.language, createdAt: g.createdAt, progress: furthestProgress(g.types), cta: g.types.includes("CTA_DEMO"), lastEventAt: g.last }));
}

// ── Public website ───────────────────────────────────────────────────────────────────────────────────────────────
export interface WebsiteVideo { kind: VideoKind; language: VideoLang; title: string; url: string; thumbnailUrl: string | null; /** allowed on the public marketing site (vs. only reachable through a sent link) */ onWebsite: boolean }

async function loadVideos(): Promise<WebsiteVideo[]> {
  const out: WebsiteVideo[] = [];
  for (const kind of ["commercial", "teaser"] as const) for (const language of ["EN", "FR"] as const) {
    const site = await getPublishedVideo(kind, language, "website");
    const v = site ?? await getPublishedVideo(kind, language, "outreach");
    if (v) out.push({ kind, language, title: v.title, url: v.url, thumbnailUrl: v.thumbnailUrl, onWebsite: !!site });
  }
  return out;
}
const cachedVideos = unstable_cache(loadVideos, ["watch-videos"], { revalidate: 300, tags: ["platform-videos"] });
/** Published videos (cached 5 min, so a visit never costs a database query). Empty — never an error — when nothing is published or the database is unreachable. */
export async function getPublishedVideos(): Promise<WebsiteVideo[]> {
  try { return await cachedVideos(); } catch { return []; }
}
/** Marketing site: only videos allowed on the website. */
export async function getWebsiteVideos(): Promise<WebsiteVideo[]> { return (await getPublishedVideos()).filter((v) => v.onWebsite); }
/** Shareable video page: any published video (a link sent to a prospect works even if the video is outreach-only). */
export async function getWatchVideo(kind: VideoKind, language: VideoLang): Promise<WebsiteVideo | null> {
  return (await getPublishedVideos()).find((v) => v.kind === kind && v.language === language) ?? null;
}
