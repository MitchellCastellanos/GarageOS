import { staticFile } from "remotion";
import { FPS } from "../config/timing";
import type { NarrationSegment, Variant } from "./manifest";

/**
 * Final mix configuration: approved background music (ElevenLabs Music, 60.000 s, 48 kHz stereo PCM, one track for
 * both languages) under the approved narration. All levels in dB relative to the files as stored.
 */

/** Measured on the track: 158 kicks, steady grid (residual std 18 ms of detection noise). */
export const MUSIC_ANALYSIS = {
  bpm: 111.967,
  beatSec: 0.53587,
  firstKickSec: 0.599,
  /** Beat on which the kick pattern stops and the track resolves (56.33 s); the decay runs to 60.0 s. */
  resolutionBeat: 104,
  durationSec: 60,
} as const;

/** Teaser = intro to beat 8, then beat 92 to the end (84 beats later = 21 bars), so the pulse never breaks. */
export const TEASER_EDIT = { spliceFromBeat: 8, spliceToBeat: 92, crossfadeSec: 0.025, preKickSec: 0.025, lengthSec: 15 } as const;

export const MIX = {
  /** Narration gain on top of the mastered files (-16 LUFS, -1.5 dBFS peak); the teaser is mostly speech, so it needs less to match the full videos. */
  narrationGainDb: { full: 2.0, teaser: 1.0 },
  music: {
    /** Music level while nobody speaks, and under speech. The difference is the duck depth. */
    openDb: -9,
    duckDb: -16,
    fadeInSec: 0.6,
    fadeOutSec: 0.35,
  },
  ducking: {
    /** Music starts dipping this long before a speech chunk begins. */
    leadSec: 0.15,
    /** Ramp times (smoothstep). Slow release avoids pumping. */
    attackSec: 0.35,
    releaseSec: 1.0,
    /** Gaps in speech shorter than this are bridged (no duck/release between words of one phrase). The teaser's
     * narration is a sparse run of single words, so gaps under 2.5 s are bridged (steady duck); `teaserOpen` re-opens the track for its drop. */
    mergeGapSec: { full: 1.0, teaser: 2.5 },
  },
  /** Teaser only: keep the music fully open around the build-and-drop at the splice (4.9 s), between "Appointments" and "Inspections". */
  teaserOpen: { fromSec: 4.05, toSec: 5.25, rampSec: 0.4 },
  /** Teaser only: the track's resolution under the logo reveal is allowed to speak (ducking relaxed by `boostDb`). */
  teaserAccent: { atSec: 11.32, widthSec: 1.4, boostDb: 5 },
} as const;

export const MUSIC_FILES: Record<Variant, string> = {
  full: "music/garageos-music.wav",
  teaser: "music/teaser-edit.wav",
};
export const musicSrc = (variant: Variant) => staticFile(MUSIC_FILES[variant]);

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
export const dbToLin = (db: number) => Math.pow(10, db / 20);

/** Speech windows on the composition timeline (seconds), with short gaps bridged. */
export function speechWindows(segments: NarrationSegment[], variant: Variant = "full"): [number, number][] {
  const raw: [number, number][] = [];
  for (const s of segments) {
    const chunks = s.speech.length ? s.speech : [[0, s.durationSec] as [number, number]];
    for (const [a, b] of chunks) raw.push([s.startSec + a, s.startSec + b]);
  }
  raw.sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const w of raw) {
    const last = out[out.length - 1];
    if (last && w[0] - last[1] < MIX.ducking.mergeGapSec[variant]) last[1] = Math.max(last[1], w[1]);
    else out.push([w[0], w[1]]);
  }
  return out;
}

/** Music gain in dB at time t (seconds): open level, dipping to the duck level around speech, plus fades. */
export function musicGainDb(t: number, windows: [number, number][], variant: Variant, totalSec: number): number {
  const { leadSec, attackSec, releaseSec } = MIX.ducking;
  let cover = 0;
  for (const [s, e] of windows) {
    const start = s - leadSec;
    const down = smooth((t - (start - attackSec)) / attackSec); // 0 -> 1 before speech
    const up = 1 - smooth((t - (e + 0.15)) / releaseSec); // 1 -> 0 after speech
    cover = Math.max(cover, Math.min(down, up));
  }
  if (variant === "teaser") {
    const { fromSec, toSec, rampSec } = MIX.teaserOpen;
    cover *= 1 - smooth((t - fromSec) / rampSec) * (1 - smooth((t - toSec) / rampSec));
  }
  let db = MIX.music.openDb + (MIX.music.duckDb - MIX.music.openDb) * cover;
  if (variant === "teaser") {
    const { atSec, widthSec, boostDb } = MIX.teaserAccent;
    db += boostDb * smooth(1 - Math.abs(t - atSec) / widthSec) * cover;
  }
  // fades: linear in amplitude so they are clean at both ends
  const fin = Math.min(1, t / MIX.music.fadeInSec);
  const fout = Math.min(1, Math.max(0, (totalSec - t) / MIX.music.fadeOutSec));
  const fade = Math.max(1e-4, fin * fout);
  return db + 20 * Math.log10(fade);
}

export const musicVolumeFn = (segments: NarrationSegment[], variant: Variant, totalFrames: number) => {
  const windows = speechWindows(segments, variant);
  const total = totalFrames / FPS;
  return (frame: number) => dbToLin(musicGainDb(frame / FPS, windows, variant, total));
};
