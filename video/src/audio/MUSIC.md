# Music and final mix

Approved track: ElevenLabs Music, `src/audio/music/garageos-music.wav` (unchanged from the supplied file): PCM 16-bit, 48 kHz stereo,
exactly 60.000 s, -13.7 LUFS integrated, -0.1 dBFS peak, decodes without errors. The same track is used for English and French.

## Analysis of the track
Measured (not assumed): steady groove at **111.97 BPM** (kick every 0.53587 s, first kick 0.599 s, 158 kicks), a soft/rising intro with a
dip at 3-5 s, a build to a full groove, a one-bar breakdown around 32-34 s, kicks stopping on beat 104 (56.3 s), then a natural decay to silence by
about 59.5 s. Roughly the last 3.7 s are the track's own ending.

## Full videos (60 s)
The track is used whole, in its natural order, from frame 0 to frame 1800; its resolution (kicks stop, 56.3 s) falls just before the CTA appears
(~56.7 s) and its decay runs out with the video. Only the level changes (below). No edits, no looping, no time-stretching.

## Teaser (15 s): `src/audio/music/teaser-edit.wav`
Built by `npm run audio:music` (`scripts/build-music.ts`). The pulse never breaks: intro up to **beat 8 (4.886 s)**, then a jump to **beat 92 (49.899 s)**,
84 beats (21 bars) later, and on to the end of the track, joined by a 25 ms equal-power crossfade just before the kick. In the teaser this gives
* an engaging start: the intro groove, then the track's own build-and-dip leading into a **drop on the beat at 4.9 s**;
* a rhythmic run on the full groove (the track's final section) under "Inspections / Invoices / All connected / Meet GarageOS";
* the track's resolution (beat 104) at **11.32 s**, as the GarageOS logo appears, and the natural decay ending at **15.0 s**, the end of the video.
Checked numerically: the second half of the edit matches the source at 51.015 s where 51.013 s is expected (2 ms), and the edit is exactly 15.000 s.

## Mix (Remotion, `src/audio/music.ts`, `MIX`)
| Setting | Value |
|---|---|
| Narration | mastered files (-16 LUFS, -1.5 dBFS peak) +2.0 dB (full), +1.0 dB (teaser, mostly speech) |
| Music, no one speaking | -9 dB |
| Music under narration | -16 dB (7 dB duck; music about 15 dB below the voice) |
| Ducking | begins 0.15 s before a phrase, smoothstep attack 0.35 s, release 1.0 s, gaps under 1.0 s bridged (full) / 2.5 s (teaser): no pumping |
| Teaser | music re-opens 4.05-5.25 s for the drop; +5 dB accent around the resolution at 11.32 s |
| Fades | music in 0.6 s, out 0.35 s (linear amplitude) |
| Stereo | music stays stereo; narration (mono masters) is centred |
| Compression/limiting | none; levels set with headroom |

Per video, ducking follows the real speech intervals from `alignment.json`, so it follows any future change to the narration.

## Tuning
Edit `MIX` and run `npm run render -- audio` (audio-only mix-downs in `output/audio/`, about 1 min per video) and measure with
`ffmpeg -i output/audio/full-en.wav -af ebur128=peak=true -f null -`. Target: -16.5 +/- 1 LUFS integrated, true peak <= -1 dBTP, all four masters within 1 LU.
