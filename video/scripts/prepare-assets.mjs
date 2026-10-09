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
console.log(`prepared ${n} captures + brand mark + fonts in ${out}`);
