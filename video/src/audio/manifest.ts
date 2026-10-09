import { staticFile } from "remotion";
import { COPY, type Locale, type SceneId, type TeaserSceneId } from "../locales";
import { FPS, FULL_SCENES, NARRATION_START, OVERLAP, TEASER_NARRATION_START, TEASER_OVERLAP, TEASER_SCENES, sceneStarts } from "../config/timing";
import alignment from "./alignment.json";
import status from "./status.json";

export type AssetStatus = "missing" | "ready";
export type Variant = "full" | "teaser";

export interface NarrationSegment {
  sceneId: string;
  locale: Locale;
  variant: Variant;
  script: string;
  /** Window on the composition timeline in seconds (measured from the real audio when status is "ready"). */
  startSec: number;
  endSec: number;
  durationSec: number;
  /** True when durationSec comes from a real file, false when estimated from word count. */
  measured: boolean;
  /** Speech intervals (seconds, relative to the segment file start) found by pause detection. Empty if unknown. */
  speech: [number, number][];
  /** Repo path of the scene-aligned file. */
  file: string;
  /** Path served to Remotion, or null while missing. */
  staticPath: string | null;
  status: AssetStatus;
}

/** Speaking rate used for the provisional estimate when no audio exists (words per second). */
const WPS: Record<Locale, number> = { en: 2.6, fr: 2.5 };
const wordCount = (s: string) => s.trim().split(/\s+/).length;

interface AlignedSegment { sceneId: string; file: string; durationSec: number; speech: [number, number][] }
const aligned = alignment as unknown as Record<string, { segments: AlignedSegment[] } | undefined>;
type StatusFile = Record<string, Record<string, { durationSec: number }>>;

function build(locale: Locale, variant: Variant): NarrationSegment[] {
  const scenes = sceneStarts(variant === "full" ? FULL_SCENES : TEASER_SCENES);
  const seqStart = (i: number) => (scenes[i].from - (i === 0 ? 0 : variant === "full" ? OVERLAP : TEASER_OVERLAP)) / FPS;
  // full: one segment per scene. teaser: the segments of the single recording, each tied to the scene it starts on.
  const entries =
    variant === "full"
      ? FULL_SCENES.map((s, i) => ({ sceneIndex: i, sceneId: s.id as string, script: COPY[locale].narration[s.id], offset: NARRATION_START[locale][s.id] }))
      : COPY[locale].teaserNarration.map((t) => ({
          sceneIndex: TEASER_SCENES.findIndex((s) => s.id === t.scene),
          sceneId: t.scene as string,
          script: t.script,
          offset: TEASER_NARRATION_START[locale][t.scene],
        }));
  return entries.map((e, i) => {
    const n = String(i + 1).padStart(2, "0");
    const al = aligned[`${variant}-${locale}`]?.segments[i];
    const real = al ? { durationSec: al.durationSec } : (status as StatusFile)[locale]?.[`${variant}-${n}`];
    const durationSec = real?.durationSec ?? wordCount(e.script) / WPS[locale];
    const rel = al?.file ?? (variant === "full" ? `scene-${n}.wav` : `teaser-${n}.wav`);
    const startSec = seqStart(e.sceneIndex) + e.offset;
    return {
      sceneId: e.sceneId,
      locale,
      variant,
      script: e.script,
      startSec,
      endSec: startSec + durationSec,
      durationSec,
      measured: !!real,
      speech: al?.speech ?? [],
      file: `video/src/audio/${locale}/${rel}`,
      staticPath: real ? staticFile(`audio/${locale}/${rel}`) : null,
      status: real ? "ready" : "missing",
    };
  });
}

export const getSegments = (locale: Locale, variant: Variant) => build(locale, variant);
export type { SceneId, TeaserSceneId };

/** Music is optional and NOT enabled: drop a licensed file at video/public/music/bed.mp3 and set it here. */
export const MUSIC = { file: "video/public/music/bed.mp3", enabled: false, volume: 0.18 };
