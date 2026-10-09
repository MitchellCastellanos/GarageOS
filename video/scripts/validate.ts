// Static + output validation. Run from video/:  npm run validate
// Static checks always run; MP4 probes run for files that exist in output/.
import { execFileSync } from "node:child_process";
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
const flat = (c: object): string[] => Object.values(c).flatMap((v) => (typeof v === "string" ? [v] : typeof v === "object" ? flat(v as object) : []));
const en = flat(COPY.en), fr = flat(COPY.fr);
ok(en.length === fr.length && en.every(Boolean) && fr.every(Boolean), `EN and FR copy have the same shape (${en.length} strings, none empty)`);
const same = en.map((s, i) => [s, fr[i]]).filter(([a, b]) => a === b && !/^garage-os\.ca$/.test(a));
ok(same.length === 0, `no FR string equals its EN string${same.length ? ": " + JSON.stringify(same) : ""}`);
for (const id of [...FULL_SCENES.map((s) => s.id)]) for (const l of LOCALES) ok(!!COPY[l].narration[id], `narration ${l}/${id}`);
for (const s of TEASER_SCENES) for (const l of LOCALES) ok(!!COPY[l].teaser[s.id as never] && !!COPY[l].teaserNarration[s.id as never], `teaser copy+narration ${l}/${s.id}`);

// 7. headline fit: character budget (the runtime fitter in AnimatedHeadline enforces actual width; see stills)
for (const l of LOCALES) {
  const heads = [COPY[l].hook.headline, COPY[l].booking.headline, COPY[l].inspection.headline, COPY[l].work.headline, COPY[l].retention.headline, COPY[l].closing.headline, ...Object.values(COPY[l].teaser).map((t) => t.headline)];
  for (const h of heads) ok(h.length <= 62, `headline fits budget (${h.length} chars) ${l}: ${h}`);
}

// audio plan: narration must finish before its scene ends (small spill tolerated and reported)
for (const l of LOCALES) for (const v of ["full", "teaser"] as const) {
  const list = v === "full" ? FULL_SCENES : TEASER_SCENES;
  let at = 0;
  getSegments(l, v).forEach((seg, i) => {
    const end = at + list[i].seconds;
    ok(seg.endSec <= end + 0.01, `${v}/${l}/${seg.sceneId} narration est. ${seg.startSec.toFixed(1)}-${seg.endSec.toFixed(1)}s within scene end ${end.toFixed(1)}s (${seg.measured ? "measured" : "estimated"}, ${seg.status})`);
    at = end;
  });
}

// 10. deterministic output names
for (const c of COMPOSITIONS) console.log(`INFO  ${c.id} -> output/${c.id}.mp4 (${c.frames} frames)`);

// MP4 probes
for (const c of COMPOSITIONS) {
  const f = `${root}/output/${c.id}.mp4`;
  if (!existsSync(f)) { console.log(`SKIP  ${c.id}.mp4 not rendered`); continue; }
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,r_frame_rate,nb_frames,pix_fmt:format=duration", "-of", "json", f]).toString());
  const s = j.streams[0];
  ok(s.width === 1920 && s.height === 1080, `${c.id}.mp4 ${s.width}x${s.height}`);
  ok(s.codec_name === "h264" && s.r_frame_rate === "30/1", `${c.id}.mp4 codec ${s.codec_name} @ ${s.r_frame_rate}`);
  ok(Math.abs(parseFloat(j.format.duration) - c.frames / FPS) < 0.1, `${c.id}.mp4 duration ${j.format.duration}s (expected ${c.frames / FPS}s)`);
}
for (const l of LOCALES as Locale[]) {
  const f = `${root}/output/thumbnail-${l}.png`;
  if (existsSync(f)) { const b = readFileSync(f); ok(b.readUInt32BE(16) === 1920 && b.readUInt32BE(20) === 1080, `thumbnail-${l}.png is 1920x1080`); }
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
