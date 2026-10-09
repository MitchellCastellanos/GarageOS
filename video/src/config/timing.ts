import type { Locale, SceneId } from "../locales/types";

export const FPS = 30;
export const sec = (s: number) => Math.round(s * FPS);

/** Scene lengths in seconds. Edit here only; scenes read their length from this table. */
export const FULL_SCENES: { id: SceneId; seconds: number }[] = [
  { id: "hook", seconds: 6.5 },
  { id: "booking", seconds: 9.5 },
  { id: "inspection", seconds: 13 },
  { id: "work", seconds: 14 },
  { id: "retention", seconds: 10 },
  { id: "closing", seconds: 7 },
];

export const TEASER_SCENES: { id: string; seconds: number }[] = [
  { id: "hook", seconds: 3 },
  { id: "booking", seconds: 3.5 },
  { id: "inspection", seconds: 3 },
  { id: "invoice", seconds: 2.5 },
  { id: "closing", seconds: 3 },
];

/** Cross-fade overlap between consecutive scenes, in frames. */
export const OVERLAP = 12;

export const sceneStarts = <T extends { seconds: number }>(list: T[]) => {
  let at = 0;
  return list.map((s) => {
    const from = at;
    at += sec(s.seconds);
    return { ...s, from, frames: sec(s.seconds) };
  });
};

export const FULL_FRAMES = FULL_SCENES.reduce((a, s) => a + sec(s.seconds), 0);
export const TEASER_FRAMES = TEASER_SCENES.reduce((a, s) => a + sec(s.seconds), 0);

/**
 * Where each full-video narration segment starts, in seconds from the beginning of its scene's Sequence
 * (scenes after the first begin OVERLAP frames before their nominal start, for the cross-fade).
 * Chosen so the key phrases land on the matching visuals (see src/audio/ALIGNMENT.md). Segments are never
 * cut or overlapped; only their start moves. Change here if visuals move.
 */
export const NARRATION_START: Record<Locale, Record<SceneId, number>> = {
  en: { hook: 0.5, booking: 4.6, inspection: 6.2, work: 3.6, retention: 3.2, closing: 2.2 },
  fr: { hook: 0.5, booking: 4.4, inspection: 5.8, work: 3.3, retention: 3.0, closing: 2.2 },
};
