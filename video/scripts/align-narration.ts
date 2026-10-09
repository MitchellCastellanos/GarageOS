// Aligns the supplied voiceovers to the approved scenes, masters them and splits them at natural pauses.
//   npm run audio:align            (needs ffmpeg/ffprobe; originals stay untouched in src/audio/source/)
// Method: detect real pauses with ffmpeg silencedetect, pick the pauses that separate the scripted segments,
// cut in the MIDDLE of those pauses (never inside a word), loudness-normalise the whole recording once so
// relative dynamics are preserved, then split. Results are written to src/audio/alignment.json.
//   full:   six scripted paragraphs -> six scene files (scene-01..06.wav)
//   teaser: one continuous take -> three segments (teaser-01..03.wav) that are placed on their scenes
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COPY, type Locale } from "../src/locales";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SILENCE_DB = -38;
const TARGET_LUFS = -16;
const TARGET_TP = -1.5;
const EDGE_FADE = 0.02; // 20 ms de-click at every cut

interface Job {
  variant: "full" | "teaser";
  locale: Locale;
  /** shortest pause treated as silence */
  silenceMin: number;
  /** which detected pauses (0-based, in order) separate the scripted segments */
  boundaryGaps: number[];
  segments: { sceneId: string; script: string; file: string }[];
}

const jobs: Job[] = [];
for (const locale of ["en", "fr"] as Locale[]) {
  const c = COPY[locale];
  jobs.push({
    variant: "full", locale, silenceMin: 0.18, boundaryGaps: [1, 2, 3, 4, 5],
    segments: (Object.keys(c.narration) as (keyof typeof c.narration)[]).map((id, i) => ({ sceneId: id, script: c.narration[id], file: `scene-0${i + 1}.wav` })),
  });
  // teaser: "<word>. <word>. <word>. …": cut after the 1st and 2nd spoken word, the rest is one continuous run
  jobs.push({
    variant: "teaser", locale, silenceMin: 0.12, boundaryGaps: [0, 1],
    segments: c.teaserNarration.map((t, i) => ({ sceneId: t.scene, script: t.script, file: `teaser-0${i + 1}.wav` })),
  });
}

const ff = (args: string[]) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
const dur = (f: string) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

function silences(file: string, min: number) {
  const r = ff(["-i", file, "-af", `silencedetect=noise=${SILENCE_DB}dB:d=${min}`, "-f", "null", "-"]);
  const s = [...r.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const e = [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  const total = dur(file);
  return s.map((a, i) => ({ start: a, end: e[i] ?? total }));
}

function loudnormPass(file: string) {
  const r = ff(["-i", file, "-af", `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11:print_format=json`, "-f", "null", "-"]);
  return JSON.parse(r.stderr.slice(r.stderr.lastIndexOf("{"), r.stderr.lastIndexOf("}") + 1)) as Record<string, string>;
}

const report: Record<string, unknown> = {};
for (const job of jobs) {
  const { variant, locale } = job;
  const src = `${root}/src/audio/source/${variant}-${locale}.wav`;
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  const total = dur(src);
  const gaps = silences(src, job.silenceMin);
  const cuts = job.boundaryGaps.map((i) => (gaps[i].start + gaps[i].end) / 2);
  if (cuts.length !== job.segments.length - 1) throw new Error(`${variant}-${locale}: ${cuts.length} cuts for ${job.segments.length} segments`);
  const bounds = [0, ...cuts, total];

  const speech: [number, number][] = [];
  let at = 0;
  for (const g of gaps) { if (g.start - at > 0.05) speech.push([at, g.start]); at = g.end; }
  if (total - at > 0.05) speech.push([at, total]);

  const m = loudnormPass(src);
  const lim = Math.pow(10, TARGET_TP / 20);
  const chain = `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset},alimiter=limit=${lim.toFixed(4)}:level=false`;
  const outDir = `${root}/src/audio/${locale}`;
  mkdirSync(outDir, { recursive: true });

  const segs = job.segments.map((sg, i) => {
    const a = bounds[i], b = bounds[i + 1], d = b - a;
    const fades = `afade=t=in:st=0:d=${EDGE_FADE},afade=t=out:st=${(d - EDGE_FADE).toFixed(3)}:d=${EDGE_FADE}`;
    // trim INSIDE the graph (after the whole-file loudnorm) so the fades' timestamps start at 0 for this segment
    const r = ff(["-y", "-i", src, "-af", `${chain},atrim=start=${a.toFixed(3)}:end=${b.toFixed(3)},asetpts=PTS-STARTPTS,${fades}`, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", `${outDir}/${sg.file}`]);
    if (r.status !== 0) throw new Error(r.stderr);
    // every segment must be audible and unclipped (guards against filter/timestamp mistakes that silence a cut)
    const vol = ff(["-i", `${outDir}/${sg.file}`, "-af", "volumedetect", "-f", "null", "-"]).stderr;
    const mean = parseFloat(vol.match(/mean_volume: (-?[\d.]+)/)?.[1] ?? "-99");
    const max = parseFloat(vol.match(/max_volume: (-?[\d.]+)/)?.[1] ?? "-99");
    if (mean < -30 || max < -6 || max > -1.2) throw new Error(`${variant}-${locale}/${sg.file}: mean ${mean} dB / max ${max} dB, segment is silent, faded or clipped`);
    const words = sg.script.trim().split(/\s+/).length;
    const chunks = speech.filter(([x, y]) => y > a && x < b).map(([x, y]) => [Math.max(x, a) - a, Math.min(y, b) - a] as [number, number]);
    const spoken = chunks.reduce((t, [x, y]) => t + (y - x), 0);
    return { sceneId: sg.sceneId, file: sg.file, srcStartSec: +a.toFixed(3), srcEndSec: +b.toFixed(3), durationSec: +dur(`${outDir}/${sg.file}`).toFixed(3), words, spokenSec: +spoken.toFixed(2), secPerWord: +(spoken / words).toFixed(3), speech: chunks.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]) };
  });

  // sanity: sec/word must be consistent (a mis-assigned boundary would break it). Teaser words are one syllable-light, so wider band.
  const med = [...segs.map((s) => s.secPerWord)].sort((x, y) => x - y)[Math.floor(segs.length / 2)];
  if (variant === "full") for (const s of segs) if (s.secPerWord < med * 0.6 || s.secPerWord > med * 1.5) throw new Error(`${locale}/${s.sceneId}: ${s.secPerWord}s/word vs median ${med}; boundary mapping looks wrong`);

  report[`${variant}-${locale}`] = { source: `src/audio/source/${variant}-${locale}.wav`, sourceDurationSec: +total.toFixed(3), loudnormInput: m, pauses: gaps.map((g) => [+g.start.toFixed(2), +g.end.toFixed(2)]), cutsSec: cuts.map((c) => +c.toFixed(3)), segments: segs };
}

writeFileSync(`${root}/src/audio/alignment.json`, JSON.stringify(report, null, 2) + "\n");
for (const [k, v] of Object.entries(report)) {
  const r = v as { sourceDurationSec: number; cutsSec: number[]; segments: { sceneId: string; durationSec: number; speech: number[][] }[] };
  console.log(k, `source ${r.sourceDurationSec}s cuts`, r.cutsSec.join(", "));
  for (const s of r.segments) console.log("   ", s.sceneId.padEnd(10), `${s.durationSec}s`, `speech ${s.speech.map((c) => c.join("-")).join(" | ")}`);
}
