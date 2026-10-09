import { FPS } from "../config/timing";
import type { NarrationSegment } from "./manifest";

export interface Cue {
  text: string;
  from: number; // frames
  to: number;
  /** True while timings are estimated from word count rather than measured audio. */
  provisional: boolean;
}

/** Split a narration into sentence cues, timed proportionally to character count inside the segment window. */
export function cuesFor(seg: NarrationSegment): Cue[] {
  const parts = seg.script.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [seg.script];
  const total = parts.reduce((a, p) => a + p.length, 0);
  let t = seg.startSec;
  return parts.map((text) => {
    const d = (seg.durationSec * text.length) / total;
    const cue = { text, from: Math.round(t * FPS), to: Math.round((t + d) * FPS), provisional: !seg.measured };
    t += d;
    return cue;
  });
}
