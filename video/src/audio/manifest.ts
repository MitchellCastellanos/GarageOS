import { staticFile } from "remotion";
import { COPY, type Locale, type SceneId, type TeaserSceneId } from "../locales";
import { FPS, FULL_SCENES, TEASER_SCENES, sceneStarts } from "../config/timing";
import status from "./status.json";

export type AssetStatus = "missing" | "ready";
export type Variant = "full" | "teaser";

export interface NarrationSegment {
  sceneId: string;
  locale: Locale;
  variant: Variant;
  script: string;
  /** Planned window in seconds on the composition timeline (provisional until real audio exists). */
  startSec: number;
  endSec: number;
  durationSec: number;
  /** True when durationSec comes from a real file (ffprobe), false when estimated from word count. */
  measured: boolean;
  /** Authoring path (drop the final file here, then run `npm run audio:sync`). */
  file: string;
  /** Path served to Remotion after sync, or null while missing. */
  staticPath: string | null;
  status: AssetStatus;
}

/** Speaking rate used for the provisional estimate (words per second). */
const WPS: Record<Locale, number> = { en: 2.6, fr: 2.5 };
/** Narration starts slightly after the scene starts so the headline lands first. */
export const NARRATION_LEAD_SEC = 0.4;

const wordCount = (s: string) => s.trim().split(/\s+/).length;

type StatusFile = Record<string, Record<string, { durationSec: number }>>;

function build(locale: Locale, variant: Variant): NarrationSegment[] {
  const scenes = sceneStarts(variant === "full" ? FULL_SCENES : TEASER_SCENES);
  const script = variant === "full" ? COPY[locale].narration : COPY[locale].teaserNarration;
  return scenes.map((sc, i) => {
    const n = String(i + 1).padStart(2, "0");
    const rel = variant === "full" ? `${locale}/scene-${n}.wav` : `${locale}/teaser-${n}.wav`;
    const key = `${variant}-${n}`;
    const real = (status as StatusFile)[locale]?.[key];
    const text = (script as Record<string, string>)[sc.id];
    const est = wordCount(text) / WPS[locale];
    const durationSec = real?.durationSec ?? est;
    const startSec = sc.from / FPS + NARRATION_LEAD_SEC;
    return {
      sceneId: sc.id,
      locale,
      variant,
      script: text,
      startSec,
      endSec: startSec + durationSec,
      durationSec,
      measured: !!real,
      file: `video/src/audio/${rel}`,
      staticPath: real ? staticFile(`audio/${rel}`) : null,
      status: real ? "ready" : "missing",
    };
  });
}

export const getSegments = (locale: Locale, variant: Variant) => build(locale, variant);
export type { SceneId, TeaserSceneId };

/** Music is optional: drop a licensed file at video/public/music/bed.mp3 and set it here. */
export const MUSIC = { file: "video/public/music/bed.mp3", enabled: false, volume: 0.18 };
