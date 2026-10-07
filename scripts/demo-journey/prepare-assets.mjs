// Converts docs/demo-journey/captures/{fr,en}/*.png into optimized WebP in public/demo/garage-laurent/{fr,en}/
// and rewrites public/demo/garage-laurent/manifest.json (dimensions, plus PDF availability).
// Optional docs/demo-journey/asset-overrides.json: { "en": { "<key>": { "reuseFrom": "fr", "badge": {"en":"","fr":""} } },
//   "fr": { ... } }  -- use it to reuse a genuine asset across locales or to label staged/secondary examples.
// Usage: DEMO_TOOLS_DIR=<dir> node scripts/demo-journey/prepare-assets.mjs
import fs from "node:fs";
import path from "node:path";
import { sharp, repoRoot, capturesDir } from "./lib.mjs";

const pub = path.join(repoRoot, "public/demo/garage-laurent");
const overridesPath = path.join(repoRoot, "docs/demo-journey/asset-overrides.json");
const overrides = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, "utf8")) : {};
const manifest = { version: 1, basePath: "/demo/garage-laurent", note: "Written by scripts/demo-journey/prepare-assets.mjs. An asset absent from this file is not shown on /demo.", assets: { fr: {}, en: {} }, invoicePdf: { fr: false, en: false } };

for (const locale of ["fr", "en"]) {
  const src = capturesDir(locale);
  const dst = path.join(pub, locale);
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.existsSync(src) ? fs.readdirSync(src).filter((n) => n.endsWith(".png")) : []) {
    const key = f.replace(/\.png$/, "");
    let quality = 88, buf;
    do { buf = await sharp(path.join(src, f)).webp({ quality, effort: 5 }).toBuffer(); quality -= 6; } while (buf.length > 500 * 1024 && quality >= 70);
    fs.writeFileSync(path.join(dst, `${key}.webp`), buf);
    const meta = await sharp(buf).metadata();
    manifest.assets[locale][key] = { width: meta.width, height: meta.height, ...(overrides[locale]?.[key] ?? {}) };
    console.log(locale, key, `${(buf.length / 1024).toFixed(0)} KB`, `${meta.width}x${meta.height}`);
  }
  // reuse entries declared only in overrides (no capture of their own)
  for (const [key, o] of Object.entries(overrides[locale] ?? {})) {
    if (!manifest.assets[locale][key] && o.reuseFrom) {
      const base = manifest.assets[o.reuseFrom]?.[key];
      if (base) manifest.assets[locale][key] = { width: base.width, height: base.height, ...o };
    }
  }
  manifest.invoicePdf[locale] = fs.existsSync(path.join(dst, "invoice-camille.pdf"));
}
fs.writeFileSync(path.join(pub, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("manifest written");
