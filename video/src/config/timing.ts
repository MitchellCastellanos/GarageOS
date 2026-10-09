import type { SceneId } from "../locales/types";

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
