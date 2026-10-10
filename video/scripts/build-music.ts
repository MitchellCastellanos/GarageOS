// Builds the 15 s teaser edit of the approved music track (src/audio/music/teaser-edit.wav).
//   npm run audio:music
// The track is a steady 111.97 BPM groove (kick every 0.53587 s, first kick at 0.599 s; measured over 158 kicks,
// see MUSIC_ANALYSIS in src/audio/music.ts). The edit keeps the intro up to beat 8, then jumps to beat 92 (84 beats = 45.01 s
// later, a whole number of bars) so the kick grid never breaks, and continues to the end of the track. The track's own
// resolution (the last kick, beat 104) therefore lands at 11.32 s in the teaser, where the logo appears, and its natural
// decay ends at 15.0 s. The splice is a 25 ms equal-power crossfade placed just before the kick.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MUSIC_ANALYSIS, TEASER_EDIT } from "../src/audio/music";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { firstKickSec: t0, beatSec: P } = MUSIC_ANALYSIS;
const { spliceFromBeat, spliceToBeat, crossfadeSec: d, preKickSec: pre, lengthSec } = TEASER_EDIT;

const aEnd = t0 + spliceFromBeat * P - pre; // A: track start .. just before beat 8
const bBeat = t0 + spliceToBeat * P; // B's beat 92 lands where A's beat 8 would be
const bStart = bBeat - pre - d + 0; // B begins one crossfade earlier so the kick is fully in by then
const trimmed = (x: number) => x.toFixed(4);

const graph = [
  `[0:a]atrim=0:${trimmed(aEnd)},asetpts=PTS-STARTPTS[a]`,
  `[0:a]atrim=start=${trimmed(bStart)},asetpts=PTS-STARTPTS[b]`,
  `[a][b]acrossfade=d=${d}:c1=qsin:c2=qsin,apad=whole_dur=${lengthSec},atrim=0:${lengthSec}[o]`,
].join(";");

const src = `${root}/src/audio/music/garageos-music.wav`;
const out = `${root}/src/audio/music/teaser-edit.wav`;
const r = spawnSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", "-i", src, "-filter_complex", graph, "-map", "[o]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", out], { encoding: "utf8" });
if (r.status !== 0) throw new Error(r.stderr);
console.log(`teaser music edit written: A 0-${trimmed(aEnd)} s + B from ${trimmed(bStart)} s (beat ${spliceToBeat} at ${trimmed(bBeat)} s) -> ${out}`);
