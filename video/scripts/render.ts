// Deterministic render driver. Run from video/:  npm run render:en | render:fr | render:teaser:en | ... | render:all | thumbnails | stills
// Outputs: output/<composition-id>.mp4, output/thumbnail-<locale>.png, output/stills/<id>-<scene>.png
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FULL_SCENES, TEASER_SCENES, sceneStarts } from "../src/config/timing";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = `${root}/output`;
const target = process.argv[2] ?? "all";
const videos = ["full-en", "full-fr", "teaser-en", "teaser-fr"];

if (!existsSync(`${root}/public/assets/en/01-dashboard-desktop.png`)) {
  console.error("Missing assets. Run `npm run prepare:assets` first.");
  process.exit(1);
}
mkdirSync(`${out}/stills`, { recursive: true });

// Remotion needs a headless-shell build. Override with REMOTION_BROWSER_EXECUTABLE; otherwise Remotion downloads its own,
// or we reuse the Playwright headless shell when present (sandboxed environments without network).
const pw = (existsSync("/opt/pw-browsers") ? readdirSync("/opt/pw-browsers") : []).find((d) => d.startsWith("chromium_headless_shell")) ?? "";
const pwShell = pw ? `/opt/pw-browsers/${pw}/chrome-linux/headless_shell` : "";
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE ?? (existsSync(pwShell) ? pwShell : null);

const serveUrl = await bundle({ entryPoint: `${root}/src/index.ts`, publicDir: `${root}/public` });
const common = { serveUrl, browserExecutable, chromiumOptions: { gl: "swangle" as const } };

async function video(id: string) {
  const composition = await selectComposition({ ...common, id });
  const outputLocation = `${out}/${id}.mp4`;
  console.log(`render ${id}: ${composition.durationInFrames}f @${composition.fps}fps -> ${outputLocation}`);
  await renderMedia({ ...common, composition, codec: "h264", crf: 18, pixelFormat: "yuv420p", outputLocation, concurrency: 4 });
}

async function still(id: string, frame: number, file: string) {
  const composition = await selectComposition({ ...common, id });
  await renderStill({ ...common, composition, frame, output: file, imageFormat: "png" });
  console.log(`still ${file}`);
}

if (target === "thumbnails" || target === "all") {
  for (const l of ["en", "fr"]) await still(`thumbnail-${l}`, 0, `${out}/thumbnail-${l}.png`);
}
const fracs = (process.env.STILL_FRACS ?? "0.7").split(",").map(Number);
if (target === "stills") {
  // one representative frame per scene (about 70% in, after the main motion has landed), both locales
  for (const l of ["en", "fr"]) {
    for (const kind of ["full", "teaser"] as const) {
      const list = sceneStarts(kind === "full" ? FULL_SCENES : TEASER_SCENES);
      for (const fr of fracs)
        for (const s of list) await still(`${kind}-${l}`, s.from + Math.round(s.frames * fr), `${out}/stills/${kind}-${l}-${s.id}-${Math.round(fr * 100)}.png`);
    }
  }
}
for (const id of videos) {
  if (target === id || target === "all") await video(id);
}
if (!["all", "thumbnails", "stills", ...videos].includes(target)) {
  console.error(`unknown target ${target}`);
  process.exit(1);
}
