// Copies narration files into public/audio and records measured durations in src/audio/status.json.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const status: Record<string, Record<string, { durationSec: number }>> = { en: {}, fr: {} };
const kinds: [string, string, number][] = [["full", "scene", 6], ["teaser", "teaser", 5]];

for (const loc of ["en", "fr"]) {
  for (const [variant, prefix, count] of kinds) {
    for (let i = 1; i <= count; i++) {
      const n = String(i).padStart(2, "0");
      const ext = ["wav"].find((e) => existsSync(`${root}/src/audio/${loc}/${prefix}-${n}.${e}`));
      if (!ext) continue;
      const src = `${root}/src/audio/${loc}/${prefix}-${n}.${ext}`;
      mkdirSync(`${root}/public/audio/${loc}`, { recursive: true });
      copyFileSync(src, `${root}/public/audio/${loc}/${prefix}-${n}.${ext}`);
      const d = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src]).toString());
      status[loc][`${variant}-${n}`] = { durationSec: Math.round(d * 100) / 100 };
    }
  }
}
writeFileSync(`${root}/src/audio/status.json`, JSON.stringify(status, null, 2) + "\n");
console.log("audio status:", JSON.stringify(status));
