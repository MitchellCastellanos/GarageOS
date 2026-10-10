// Copies the authentic GarageOS captures (original PNGs) and brand marks into video/public/assets.
// Source of truth: docs/demo-journey/captures/{en,fr}. Nothing is regenerated or redrawn.
import { copyFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const out = resolve(here, "../public/assets");

let n = 0;
for (const loc of ["en", "fr"]) {
  const src = join(repo, "docs/demo-journey/captures", loc);
  const dst = join(out, loc);
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src).filter((f) => f.endsWith(".png"))) {
    copyFileSync(join(src, f), join(dst, f));
    n++;
  }
}
mkdirSync(join(out, "brand"), { recursive: true });
copyFileSync(join(repo, "garageos-brand-kit/marks/garageos-imagotipo.png"), join(out, "brand/mark.png"));
for (const w of ["500", "600", "700"]) {
  const f = `oswald-latin-${w}-normal.woff2`;
  const p = resolve(here, "../node_modules/@fontsource/oswald/files", f);
  if (!existsSync(p)) throw new Error(`Missing ${p}; run npm install in video/`);
  mkdirSync(join(out, "fonts"), { recursive: true });
  copyFileSync(p, join(out, "fonts", f));
}
for (const w of ["500", "600"]) {
  const f = `inter-latin-${w}-normal.woff2`;
  const p = resolve(here, "../node_modules/@fontsource/inter/files", f);
  if (!existsSync(p)) throw new Error(`Missing ${p}; run npm install in video/`);
  copyFileSync(p, join(out, "fonts", f));
}
// scene-aligned narration (mastered WAVs committed in src/audio/<locale>/) -> public/audio for Remotion
let a = 0;
for (const loc of ["en", "fr"]) {
  const dir = join(here, "../src/audio", loc);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".wav"))) {
    mkdirSync(join(out, "../audio", loc), { recursive: true });
    copyFileSync(join(dir, f), join(out, "../audio", loc, f));
    a++;
  }
}
// approved music: full-length track + the 15 s teaser edit (built by `npm run audio:music`)
mkdirSync(join(out, "../music"), { recursive: true });
for (const [src, dst] of [["garageos-music.wav", "garageos-music.wav"], ["teaser-edit.wav", "teaser-edit.wav"]]) {
  const p = join(here, "../src/audio/music", src);
  if (!existsSync(p)) throw new Error(`Missing ${p}; run npm run audio:music`);
  copyFileSync(p, join(out, "../music", dst));
}
console.log(`prepared ${a} narration files + music;`);
console.log(`prepared ${n} captures + brand mark + fonts in ${out}`);
