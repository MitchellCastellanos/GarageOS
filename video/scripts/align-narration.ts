// Aligns the supplied full-length voiceovers to the six approved scenes, masters them and splits them into scene files.
//   npm run audio:align            (needs ffmpeg/ffprobe; originals stay untouched in src/audio/source/)
// Method: detect real pauses with ffmpeg silencedetect, pick the pauses that separate the scripted segments,
// cut in the MIDDLE of those pauses (never inside a word), loudness-normalise the whole recording once so
// relative dynamics are preserved, then split. Results are written to src/audio/alignment.json.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COPY, type Locale, type SceneId } from "../src/locales";
import { FULL_SCENES } from "../src/config/timing";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SILENCE_DB = -38;
const SILENCE_MIN = 0.18;
const TARGET_LUFS = -16;
const TARGET_TP = -1.5;
const EDGE_FADE = 0.02; // 20 ms de-click at every cut

/** Which detected pauses (0-based, in order) separate the scripted segments. Verified by `sanity` below. */
const BOUNDARY_GAPS: Record<Locale, number[]> = { en: [1, 2, 3, 4, 5], fr: [1, 2, 3, 4, 5] };

const ff = (args: string[]) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
const dur = (f: string) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

function silences(file: string) {
  const r = ff(["-i", file, "-af", `silencedetect=noise=${SILENCE_DB}dB:d=${SILENCE_MIN}`, "-f", "null", "-"]);
  const s = [...r.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const e = [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  const total = dur(file);
  // a trailing silence may have no end line; close it at the file end
  return s.map((a, i) => ({ start: a, end: e[i] ?? total }));
}

function loudnormPass(file: string) {
  const r = ff(["-i", file, "-af", `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11:print_format=json`, "-f", "null", "-"]);
  const j = JSON.parse(r.stderr.slice(r.stderr.lastIndexOf("{"), r.stderr.lastIndexOf("}") + 1));
  return j as Record<string, string>;
}

const report: Record<string, unknown> = {};
const status: Record<string, Record<string, { durationSec: number }>> = { en: {}, fr: {} };

for (const locale of ["en", "fr"] as Locale[]) {
  const src = `${root}/src/audio/source/full-${locale}.wav`;
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  const total = dur(src);
  const gaps = silences(src);
  const cutsIdx = BOUNDARY_GAPS[locale];
  const cuts = cutsIdx.map((i) => (gaps[i].start + gaps[i].end) / 2);
  const bounds = [0, ...cuts, total];
  const ids = FULL_SCENES.map((s) => s.id) as SceneId[];

  // speech chunks = complement of silences inside the recording
  const speech: [number, number][] = [];
  let at = 0;
  for (const g of gaps) { if (g.start - at > 0.05) speech.push([at, g.start]); at = g.end; }
  if (total - at > 0.05) speech.push([at, total]);

  // master: two-pass loudnorm on the whole file, then a brickwall limiter just under the true-peak target
  const m = loudnormPass(src);
  const lim = Math.pow(10, TARGET_TP / 20);
  const chain = `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset},alimiter=limit=${lim.toFixed(4)}:level=false`;
  const masterDir = `${root}/src/audio/${locale}`;
  mkdirSync(masterDir, { recursive: true });

  const segs = ids.map((id, i) => {
    const a = bounds[i], b = bounds[i + 1];
    const file = `scene-${String(i + 1).padStart(2, "0")}.wav`;
    const d = b - a;
    const fades = `afade=t=in:st=0:d=${EDGE_FADE},afade=t=out:st=${(d - EDGE_FADE).toFixed(3)}:d=${EDGE_FADE}`;
    const r = ff(["-y", "-i", src, "-ss", a.toFixed(3), "-t", d.toFixed(3), "-af", `${chain},${fades}`, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", `${masterDir}/${file}`]);
    if (r.status !== 0) throw new Error(r.stderr);
    const words = COPY[locale].narration[id].trim().split(/\s+/).length;
    const chunks = speech.filter(([x, y]) => y > a && x < b).map(([x, y]) => [Math.max(x, a) - a, Math.min(y, b) - a] as [number, number]);
    const spoken = chunks.reduce((t, [x, y]) => t + (y - x), 0);
    const sceneSec = FULL_SCENES[i].seconds;
    status[locale][`full-${String(i + 1).padStart(2, "0")}`] = { durationSec: Math.round(dur(`${masterDir}/${file}`) * 1000) / 1000 };
    return { sceneId: id, file, srcStartSec: +a.toFixed(3), srcEndSec: +b.toFixed(3), durationSec: +d.toFixed(3), words, spokenSec: +spoken.toFixed(2), secPerWord: +(spoken / words).toFixed(3), sceneSec, speech: chunks.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]) };
  });

  // sanity: sec/word should be consistent across segments (a mis-assigned boundary would break this)
  const med = [...segs.map((s) => s.secPerWord)].sort((x, y) => x - y)[Math.floor(segs.length / 2)];
  for (const s of segs) if (s.secPerWord < med * 0.6 || s.secPerWord > med * 1.5) throw new Error(`${locale}/${s.sceneId}: ${s.secPerWord}s/word vs median ${med}; boundary mapping looks wrong`);

  report[`full-${locale}`] = { source: `src/audio/source/full-${locale}.wav`, sourceDurationSec: +total.toFixed(3), loudnormInput: m, pauses: gaps.map((g) => [+g.start.toFixed(2), +g.end.toFixed(2)]), cutsSec: cuts.map((c) => +c.toFixed(3)), segments: segs };
}

writeFileSync(`${root}/src/audio/alignment.json`, JSON.stringify(report, null, 2) + "\n");

console.log(JSON.stringify(report, (k, v) => (k === "speech" || k === "loudnormInput" ? undefined : v), 1));
