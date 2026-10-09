// Static + output validation. Run from video/:  npm run validate
// Static checks always run; MP4 probes run for files that exist in output/.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SHOTS, shotPath, sizeOf, type ShotKey } from "../src/config/assets";
import { COPY, LOCALES, type Locale } from "../src/locales";
import { FULL_FRAMES, FULL_SCENES, TEASER_FRAMES, TEASER_SCENES, FPS, sec } from "../src/config/timing";
import { getSegments } from "../src/audio/manifest";
import { COMPOSITIONS } from "../src/Root";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const ok = (c: boolean, msg: string) => {
  console.log(`${c ? "PASS" : "FAIL"}  ${msg}`);
  if (!c) failures++;
};

// 1. every referenced screenshot exists, for both locales, with the expected pixel size
import { readFileSync } from "node:fs";
const src = ["Scheduling", "Inspection", "WorkOrders", "Retention", "Opening", "Closing", "TeaserScenes"].map((f) => readFileSync(`${root}/src/scenes/${f}.tsx`, "utf8")).join("\n") + readFileSync(`${root}/src/compositions/Thumbnail.tsx`, "utf8");
const used = new Set([...src.matchAll(/["'](\d\d-[a-z0-9-]+)["']/g)].map((m) => m[1] as ShotKey));
for (const k of used) ok(k in SHOTS, `scene references known capture ${k}`);
for (const l of LOCALES) {
  for (const k of used) {
    const p = `${root}/public/assets/${l}/${k}.png`;
    ok(existsSync(p), `${l}/${k}.png present`);
    if (existsSync(p)) {
      const buf = readFileSync(p);
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      const exp = sizeOf(l, k);
      ok(w === exp.w && h === exp.h, `${l}/${k}.png is ${w}x${h} (expected ${exp.w}x${exp.h})`);
    }
  }
}
// 6. locale-correct sources: scenes never hard-code a locale folder, always shotSrc(locale, ...)
ok(!/assets\/(en|fr)\//.test(src), "scenes never hard-code a locale asset folder (EN uses EN captures, FR uses FR captures)");
// files in public/assets match docs/demo-journey/captures byte size (authentic originals, unmodified)
for (const l of LOCALES) for (const k of used) {
  const a = statSync(`${root}/public/assets/${l}/${k}.png`).size;
  const b = statSync(`${root}/../docs/demo-journey/captures/${l}/${k}.png`).size;
  ok(a === b, `${l}/${k}.png identical size to docs/demo-journey/captures original`);
}

// 3/4. durations
ok(FULL_FRAMES === sec(60) && FULL_FRAMES === 1800, `full = ${FULL_FRAMES} frames (60.0 s @ ${FPS} fps)`);
ok(TEASER_FRAMES === sec(15), `teaser = ${TEASER_FRAMES} frames (15.0 s)`);

// 5. every scene supports both locales: non-empty, distinct copy; no English leaking into FR
const flat = (c: object): string[] => Object.entries(c).filter(([k]) => k !== "scene").map(([, v]) => v).flatMap((v) => (typeof v === "string" ? [v] : typeof v === "object" ? flat(v as object) : []));
const en = flat(COPY.en), fr = flat(COPY.fr);
ok(en.length === fr.length && en.every(Boolean) && fr.every(Boolean), `EN and FR copy have the same shape (${en.length} strings, none empty)`);
const same = en.map((s, i) => [s, fr[i]]).filter(([a, b]) => a === b && !/^(garage-os\.ca|Inspections\.)$/.test(a));
ok(same.length === 0, `no FR string equals its EN string${same.length ? ": " + JSON.stringify(same) : ""}`);
for (const id of [...FULL_SCENES.map((s) => s.id)]) for (const l of LOCALES) ok(!!COPY[l].narration[id], `narration ${l}/${id}`);
for (const s of TEASER_SCENES) for (const l of LOCALES) ok(!!COPY[l].teaser[s.id as never], `teaser copy ${l}/${s.id}`);
for (const l of LOCALES) ok(COPY[l].teaserNarration.length === 3 && COPY[l].teaserNarration.every((t) => t.script && TEASER_SCENES.some((s) => s.id === t.scene)), `teaser narration segments ${l}`);

// 7. headline fit: character budget (the runtime fitter in AnimatedHeadline enforces actual width; see stills)
for (const l of LOCALES) {
  const heads = [COPY[l].hook.headline, COPY[l].booking.headline, COPY[l].inspection.headline, COPY[l].work.headline, COPY[l].retention.headline, COPY[l].closing.headline, ...Object.values(COPY[l].teaser).map((t) => t.headline)];
  for (const h of heads) ok(h.length <= 62, `headline fits budget (${h.length} chars) ${l}: ${h}`);
}

// audio plan: full narration must finish before its scene ends; teaser narration before the video ends
for (const l of LOCALES) {
  let at = 0;
  getSegments(l, "full").forEach((seg, i) => {
    const end = at + FULL_SCENES[i].seconds;
    ok(seg.endSec <= end + 0.01, `full/${l}/${seg.sceneId} narration ${seg.startSec.toFixed(1)}-${seg.endSec.toFixed(1)}s within scene end ${end.toFixed(1)}s (${seg.measured ? "measured" : "estimated"}, ${seg.status})`);
    at = end;
  });
  const t = getSegments(l, "teaser");
  t.forEach((seg, i) => {
    ok(seg.endSec <= TEASER_FRAMES / FPS, `teaser/${l}/${seg.sceneId} narration ${seg.startSec.toFixed(2)}-${seg.endSec.toFixed(2)}s ends before the ${TEASER_FRAMES / FPS}s video end (${seg.status})`);
    ok(seg.status === "ready" && existsSync(`${root}/public/audio/${l}/teaser-0${i + 1}.wav`), `teaser/${l}/${seg.sceneId} narration file present`);
    if (i > 0) ok(seg.startSec >= t[i - 1].endSec, `teaser/${l}/${seg.sceneId} starts after previous narration ends`);
  });
}

// narration/subtitle integrity on the real audio
import { cuesFor } from "../src/audio/subtitles";
for (const l of LOCALES) {
  const segs = getSegments(l, "full");
  segs.forEach((s, i) => {
    ok(s.status === "ready" && existsSync(`${root}/public/audio/${l}/scene-0${i + 1}.wav`), `full/${l}/${s.sceneId} narration file present (public/audio)`);
    if (i > 0) ok(s.startSec >= segs[i - 1].endSec, `full/${l}/${s.sceneId} starts after previous narration ends (${s.startSec.toFixed(2)} >= ${segs[i - 1].endSec.toFixed(2)})`);
    const cues = cuesFor(s);
    ok(cues.every((c, j) => c.to > c.from && (j === 0 || c.from >= cues[j - 1].to - 3)), `full/${l}/${s.sceneId} ${cues.length} cue(s) ordered`);
    ok(cues[0].from >= Math.floor(s.startSec * FPS) && cues[cues.length - 1].to <= Math.ceil(s.endSec * FPS) + 3, `full/${l}/${s.sceneId} cues inside narration window`);
    ok(cues.every((c) => c.text.length <= 75), `full/${l}/${s.sceneId} cue length <= 75 chars`);
  });
}

// 10. deterministic output names
for (const c of COMPOSITIONS) console.log(`INFO  ${c.id} -> output/${c.id}.mp4 (${c.frames} frames)`);

// MP4 probes
for (const c of COMPOSITIONS) {
  const f = `${root}/output/${c.id}.mp4`;
  if (!existsSync(f)) { console.log(`SKIP  ${c.id}.mp4 not rendered`); continue; }
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,r_frame_rate,nb_frames,pix_fmt,color_range,color_space:format=duration", "-of", "json", f]).toString());
  const s = j.streams[0];
  ok(s.width === 1920 && s.height === 1080, `${c.id}.mp4 ${s.width}x${s.height}`);
  ok(s.codec_name === "h264" && s.r_frame_rate === "30/1", `${c.id}.mp4 codec ${s.codec_name} @ ${s.r_frame_rate}`);
  ok(s.pix_fmt === "yuv420p" && s.color_range === "tv" && s.color_space === "bt709", `${c.id}.mp4 broadly compatible pixel format (${s.pix_fmt}, ${s.color_range}, ${s.color_space})`);
  const au = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,channels,sample_rate,duration", "-of", "json", f]).toString()).streams[0];
  ok(!!au && au.codec_name === "aac", `${c.id}.mp4 has an audio stream (${au?.codec_name}, ${au?.channels}ch, ${au?.sample_rate} Hz)`);
  const m = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", f, "-map", "0:a:0", "-af", "ebur128=peak=true,astats=metadata=0", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 }).stderr;
  const lufs = parseFloat([...m.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop()?.[1] ?? "NaN");
  const tp = parseFloat([...m.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].pop()?.[1] ?? "NaN");
  const flat = parseFloat([...m.matchAll(/Flat factor: ([\d.]+)/g)].pop()?.[1] ?? "NaN");
  ok(lufs > -17.5 && lufs < -14.5, `${c.id}.mp4 dialogue loudness ${lufs} LUFS (target -16 +/- 1.5)`);
  ok(tp <= -1, `${c.id}.mp4 true-peak ${tp} dBFS (<= -1.0, no clipping)`);
  ok(flat === 0, `${c.id}.mp4 flat-factor ${flat} (0 = no clipped runs)`);
  ok(Math.abs(parseFloat(au?.duration ?? "0") - c.frames / FPS) < 0.15, `${c.id}.mp4 audio duration ${au?.duration}s matches video`);
  ok(Math.abs(parseFloat(j.format.duration) - c.frames / FPS) < 0.1, `${c.id}.mp4 duration ${j.format.duration}s (expected ${c.frames / FPS}s)`);
}
for (const l of LOCALES as Locale[]) {
  const f = `${root}/output/thumbnail-${l}.png`;
  if (existsSync(f)) { const b = readFileSync(f); ok(b.readUInt32BE(16) === 1920 && b.readUInt32BE(20) === 1080, `thumbnail-${l}.png is 1920x1080`); }
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
