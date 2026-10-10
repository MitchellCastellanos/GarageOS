import { FPS } from "../config/timing";
import type { NarrationSegment } from "./manifest";

export interface Cue {
  text: string;
  from: number; // frames
  to: number;
  /** True while timings are estimated from word count rather than measured audio. */
  provisional: boolean;
}

const MAX_CUE_CHARS = 60;
const COMMA_SPLIT_CHARS = 45;

// Words a cue should not end on / is happy to start with (EN + FR).
const WEAK_END = new Set("a an the and or to of in on for with your our their your et ou de des du la le les un une vos votre aux au à à en pour avec que qui".split(" "));
const GOOD_START = new Set("and your through with in et grâce aux au à pour avec vos".split(" "));

/** Break one over-long clause at a natural point near its middle (never inside a word). */
function halve(s: string): string[] {
  if (s.length <= MAX_CUE_CHARS) return [s];
  const mid = s.length / 2;
  let best = -1, bestScore = Infinity;
  for (let i = 1; i < s.length - 1; i++) {
    if (s[i] !== " ") continue;
    const prev = s.slice(0, i).split(" ").pop()!.toLowerCase().replace(/[^\p{L}’']/gu, "");
    const next = s.slice(i + 1).split(" ")[0].toLowerCase().replace(/[^\p{L}’']/gu, "");
    const score = Math.abs(i - mid) + (WEAK_END.has(prev) ? 18 : 0) - (GOOD_START.has(next) ? 12 : 0);
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best < 0 ? [s] : [...halve(s.slice(0, best)), ...halve(s.slice(best + 1))];
}

/** Split a script into readable clauses: sentence ends, then commas, then the middle of anything still too long. */
export function clauses(script: string): string[] {
  const sentences = script.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [script];
  return sentences.flatMap((s) => {
    if (s.length <= COMMA_SPLIT_CHARS) return [s];
    const parts = s.split(/(?<=,)\s+/);
    // merge tiny leftovers so we never show 1-2 word cues
    const out: string[] = [];
    for (const p of parts) (out.length && p.split(" ").length < 3 ? (out[out.length - 1] += " " + p) : out.push(p));
    return out.flatMap(halve);
  });
}

/**
 * Cues timed on the real speech: the speech-only timeline (pauses removed) is divided in proportion to
 * clause length, so a pause between words is never charged to a cue and cues start/stop with the voice.
 * Without measured speech it falls back to a proportional split over the estimated duration.
 */
export function cuesFor(seg: NarrationSegment): Cue[] {
  const parts = clauses(seg.script);
  const weight = parts.map((p) => p.replace(/[^\p{L}\p{N}]/gu, "").length);
  const total = weight.reduce((a, b) => a + b, 0);
  const speech: [number, number][] = seg.speech.length ? seg.speech : [[0, seg.durationSec]];
  const speechTotal = speech.reduce((t, [a, b]) => t + (b - a), 0);
  // map a position on the speech-only timeline back to segment time
  const at = (x: number) => {
    let left = x;
    for (const [a, b] of speech) {
      if (left <= b - a + 1e-9) return a + left;
      left -= b - a;
    }
    return speech[speech.length - 1][1];
  };
  // chunk boundaries on the speech-only timeline (cumulative end of every voiced chunk except the last)
  const edges: number[] = [];
  let run = 0;
  for (const [a, b] of speech.slice(0, -1)) { run += b - a; edges.push(run); }
  // a clause boundary lands on a real pause when one is within SNAP seconds of where proportion puts it
  const SNAP = 0.45;
  const snap = (x: number) => {
    let best = x, d = SNAP;
    for (const e of edges) if (Math.abs(e - x) < d) { d = Math.abs(e - x); best = e; }
    return best;
  };
  let acc = 0;
  let prev = 0;
  const cues = parts.map((text, i) => {
    acc += weight[i];
    const x0 = prev;
    const x1 = i === parts.length - 1 ? speechTotal : Math.max(x0 + 0.05, snap((acc / total) * speechTotal));
    prev = x1;
    // start right at the first voiced sample of the cue; end where its last voiced sample is
    const a = i === 0 ? speech[0][0] : at(x0 + 1e-6);
    const b = at(x1);
    return { text, from: Math.round((seg.startSec + a) * FPS), to: Math.round((seg.startSec + b) * FPS) + 3, provisional: !seg.measured };
  });
  // hold each cue a few frames past the last voiced sample, but never over the next cue
  return cues.map((c, i) => ({ ...c, to: i + 1 < cues.length ? Math.min(c.to, cues[i + 1].from) : c.to }));
}
