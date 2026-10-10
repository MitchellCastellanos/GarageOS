// Sales video: stable URLs, attribution rules and playback measurement — PURE (no I/O) so the rules that decide what counts as
// "watched" are unit-tested. Everything here is deliberately conservative: a link being opened is NOT a view of the video,
// and a view is only what a real, user-started playback can prove.
export type VideoKind = "commercial" | "teaser";
export type VideoLang = "EN" | "FR";

/** PlatformVideo keys. The 60 s commercial and the 15 s teaser. */
export const VIDEO_KINDS: Record<VideoKind, { key: VideoKind; seconds: number }> = {
  commercial: { key: "commercial", seconds: 60 },
  teaser: { key: "teaser", seconds: 15 },
};
export const isVideoKind = (v: unknown): v is VideoKind => v === "commercial" || v === "teaser";
export const isVideoLang = (v: unknown): v is VideoLang => v === "EN" || v === "FR";

/** Link lifetime: long enough for a sales cycle, short enough that a forwarded old email stops attributing. */
export const VIDEO_LINK_TTL_DAYS = 90;
export const VIDEO_TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;
/** The per-page-view id the browser invents in memory (never stored in the browser, never a cookie). */
export const VIEW_KEY_RE = /^[A-Za-z0-9_-]{12,40}$/;

// ── Stable public URLs ────────────────────────────────────────────────────────────────────────────────────────────
/** `/watch/en` (60 s) and `/watch/en/teaser` (15 s); `/watch/fr`, `/watch/fr/teaser`. */
export function watchPath(lang: VideoLang, kind: VideoKind = "commercial"): string {
  return `/watch/${lang.toLowerCase()}${kind === "teaser" ? "/teaser" : ""}`;
}
/** Absolute landing URL. With a token the visit is attributed; without one it is an anonymous public view. */
export function watchUrl(appUrl: string, lang: VideoLang, kind: VideoKind, token?: string | null): string {
  return `${appUrl.replace(/\/+$/, "")}${watchPath(lang, kind)}${token ? `?t=${encodeURIComponent(token)}` : ""}`;
}
/** Finds the attributed watch links inside an email body: [{ lang, kind, token }] in order of appearance, de-duplicated. */
export function extractWatchLinks(text: string, appUrl: string): { lang: VideoLang; kind: VideoKind; token: string; url: string }[] {
  const base = appUrl.replace(/\/+$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${base}/watch/(en|fr)(/teaser)?\\?t=([A-Za-z0-9_-]{32,64})`, "g");
  const out: { lang: VideoLang; kind: VideoKind; token: string; url: string }[] = [];
  for (const m of text.matchAll(re)) {
    if (out.some((o) => o.token === m[3])) continue;
    out.push({ lang: m[1] === "fr" ? "FR" : "EN", kind: m[2] ? "teaser" : "commercial", token: m[3], url: m[0] });
  }
  return out;
}

// ── Who is not a viewer ───────────────────────────────────────────────────────────────────────────────────────────
const BOT_UA = /(bot|crawl|spider|slurp|preview|scanner|fetch|monitor|headless|phantom|puppeteer|playwright|lighthouse|curl|wget|python-requests|java\/|go-http|okhttp|libwww|facebookexternalhit|whatsapp|skypeuripreview|slackbot|linkedinbot|twitterbot|embedly|proofpoint|mimecast|barracuda|safelinks|urldefense|trendmicro|symantec|forcepoint|cisco|sophos)/i;
/** Mail-security scanners, link-preview fetchers and generic bots. A missing user-agent is treated as a bot. */
export function isLikelyBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  return ua.length < 12 || BOT_UA.test(ua);
}
/** Browser/prefetch hints that mean "nobody opened this page yet". */
export function isPrefetchRequest(h: { get(name: string): string | null }): boolean {
  const purpose = `${h.get("purpose") ?? ""} ${h.get("sec-purpose") ?? ""} ${h.get("x-purpose") ?? ""} ${h.get("x-moz") ?? ""}`.toLowerCase();
  return /prefetch|preview|prerender/.test(purpose);
}

// ── Events ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** What the BROWSER may report. CTA events are recorded server-side by the redirect, never trusted from the client. */
export const CLIENT_EVENT_TYPES = ["PAGE_VIEW", "PLAY", "PROGRESS_25", "PROGRESS_50", "PROGRESS_75", "COMPLETE"] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];
export type VideoEventType = ClientEventType | "CTA_DEMO" | "CTA_TRIAL";
export const isClientEventType = (v: unknown): v is ClientEventType => typeof v === "string" && (CLIENT_EVENT_TYPES as readonly string[]).includes(v);

const PROGRESS_PCT: Partial<Record<VideoEventType, number>> = { PROGRESS_25: 25, PROGRESS_50: 50, PROGRESS_75: 75, COMPLETE: 90 };

export interface PriorEvent { type: VideoEventType; firstAt: Date; lastAt: Date; lastViewKey: string | null }
export type EventDecision = { accept: true; countsAsNewView: boolean } | { accept: false; reason: "UNKNOWN_TYPE" | "NEEDS_PLAY" | "TOO_FAST" | "DUPLICATE" | "FLOOD" };

/**
 * Server-side plausibility for a client-reported event (the browser can lie; this keeps the lies cheap to detect and the numbers honest):
 *  - a watched milestone needs a PLAY reported by the SAME page view, and enough real time must have passed since that play;
 *  - the same type from the same page view is a duplicate; the same type again within 2 s is a flood.
 */
export function decideClientEvent(args: { type: ClientEventType; viewKey: string; now: Date; videoSeconds: number; prior: PriorEvent[] }): EventDecision {
  const { type, viewKey, now, videoSeconds, prior } = args;
  if (!isClientEventType(type)) return { accept: false, reason: "UNKNOWN_TYPE" };
  const same = prior.find((p) => p.type === type);
  if (same?.lastViewKey === viewKey) return { accept: false, reason: "DUPLICATE" };
  if (same && now.getTime() - same.lastAt.getTime() < 2000) return { accept: false, reason: "FLOOD" };
  const pct = PROGRESS_PCT[type];
  if (pct) {
    const play = prior.find((p) => p.type === "PLAY");
    if (!play || play.lastViewKey !== viewKey) return { accept: false, reason: "NEEDS_PLAY" };
    // Real playback time since the play, with 15% tolerance for rounding/buffering (a skipped-to-the-end "view" fails here).
    const needed = (pct / 100) * videoSeconds * 0.85 * 1000;
    if (now.getTime() - play.lastAt.getTime() < needed) return { accept: false, reason: "TOO_FAST" };
  }
  if (type === "PLAY" && !prior.some((p) => p.type === "PAGE_VIEW" && p.lastViewKey === viewKey)) {
    // PLAY without the page-view beacon is still real (the beacon may be blocked); it is accepted.
  }
  return { accept: true, countsAsNewView: !same || same.lastViewKey !== viewKey };
}

// ── Playback measurement (runs in the browser; pure so it can be tested) ──────────────────────────────────────────
export interface TrackerOut { events: ClientEventType[] }
/**
 * Counts only CONTINUOUS playback: `time` samples that advance by a normal amount while playing. A seek (jump) adds nothing, so
 * dragging the bar to the end can never reach 75%. Milestones are emitted once each, in order, never before PLAY.
 */
export class WatchTracker {
  private watched = 0;
  private last: number | null = null;
  private played = false;
  private fired = new Set<ClientEventType>();
  constructor(private readonly duration: number) {}

  /** First user-initiated play. */
  onPlay(): TrackerOut {
    const events: ClientEventType[] = [];
    if (!this.played) { this.played = true; this.fired.add("PLAY"); events.push("PLAY"); }
    return { events };
  }
  /** Feed `currentTime` from timeupdate while playing. */
  onTime(time: number): TrackerOut {
    const events: ClientEventType[] = [];
    if (!this.played || !(this.duration > 0)) return { events };
    if (this.last !== null) {
      const d = time - this.last;
      if (d > 0 && d <= 1.5) this.watched += d; // continuous playback only
    }
    this.last = time;
    const pct = (this.watched / this.duration) * 100;
    for (const [type, at] of [["PROGRESS_25", 25], ["PROGRESS_50", 50], ["PROGRESS_75", 75]] as const) {
      if (pct >= at && !this.fired.has(type)) { this.fired.add(type); events.push(type); }
    }
    return { events };
  }
  onSeek(): void { this.last = null; }
  onPause(): void { this.last = null; }
  /** `ended`: complete only if at least 90% was really watched. */
  onEnded(): TrackerOut {
    const events: ClientEventType[] = [];
    if (this.played && this.watched / this.duration >= 0.9 && !this.fired.has("COMPLETE")) { this.fired.add("COMPLETE"); events.push("COMPLETE"); }
    return { events };
  }
  get watchedSeconds(): number { return this.watched; }
}

// ── Timeline wording keys (translated in the CRM dictionaries) ────────────────────────────────────────────────────
export const VIDEO_ACTIVITY_EVENT: Record<VideoEventType, string> = {
  PAGE_VIEW: "video_page_view", PLAY: "video_play", PROGRESS_25: "video_progress_25", PROGRESS_50: "video_progress_50",
  PROGRESS_75: "video_progress_75", COMPLETE: "video_complete", CTA_DEMO: "video_cta_demo", CTA_TRIAL: "video_cta_trial",
};
/** Types that get a prospect-timeline entry (the first time only). 25/50 stay in the summary to keep the timeline readable. */
export const TIMELINE_EVENT_TYPES: readonly VideoEventType[] = ["PAGE_VIEW", "PLAY", "PROGRESS_75", "COMPLETE", "CTA_DEMO", "CTA_TRIAL"];

export function linkIsUsable(link: { expiresAt: Date; revokedAt: Date | null }, now = new Date()): boolean {
  return !link.revokedAt && link.expiresAt.getTime() > now.getTime();
}

/** Furthest real progress reached on a link, for the compact CRM summary. */
export function furthestProgress(types: VideoEventType[]): "none" | "viewed" | "played" | "25" | "50" | "75" | "complete" {
  const has = (t: VideoEventType) => types.includes(t);
  if (has("COMPLETE")) return "complete";
  if (has("PROGRESS_75")) return "75";
  if (has("PROGRESS_50")) return "50";
  if (has("PROGRESS_25")) return "25";
  if (has("PLAY")) return "played";
  if (has("PAGE_VIEW")) return "viewed";
  return "none";
}
