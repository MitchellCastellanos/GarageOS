import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_OUTREACH_VIDEO_KEY, pickVideo, videoCtaText, type VideoPlacement } from "@/domain/platform-video";
import type { TemplateVars } from "@/domain/sales-comms/templates";

export async function getPublishedVideo(key: string, language: "EN" | "FR", placement: VideoPlacement) {
  const rows = await db.platformVideo.findMany({ where: { key, language, status: "PUBLISHED" } });
  return pickVideo(rows, key, language, placement);
}

/** Template variables for the outreach video. Empty (so the optional CTA disappears and video-only templates block) when nothing is published. */
export async function videoVars(language: "EN" | "FR", key = DEFAULT_OUTREACH_VIDEO_KEY): Promise<TemplateVars> {
  const v = await getPublishedVideo(key, language, "outreach");
  if (!v) return {};
  return { "video.link": v.url, "video.title": v.title, "video.cta": videoCtaText(language, v.title, v.url) };
}
