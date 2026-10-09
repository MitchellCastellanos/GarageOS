# GarageOS bilingual product video (Remotion)

Isolated workspace that renders the GarageOS launch commercial in **Canadian English** and **Québec French**:

| Output (`video/output/`) | Length | Notes |
| --- | --- | --- |
| `full-en.mp4`, `full-fr.mp4` | 60 s, 1800 f @ 30 fps, 1920×1080 | 6 scenes |
| `teaser-en.mp4`, `teaser-fr.mp4` | 15 s, 450 f | separate edit, not a speed-up |
| `thumbnail-en.png`, `thumbnail-fr.png` | 1920×1080 | still frame for email/landing |

Nothing here touches the Next.js app: no database, Stripe, Twilio, Resend or Supabase, and no network access is needed to render.
`output/`, `public/assets/` (copied captures), `public/audio/` and `public/music/` are git-ignored.

## Architecture

```
video/
  src/
    Root.tsx                 compositions: full-en, full-fr, teaser-en, teaser-fr, thumbnail-en, thumbnail-fr
    compositions/            Explainer (full) + Teaser share one timeline builder (Film); Thumbnail
    scenes/                  Opening, Scheduling, Inspection, WorkOrders, Retention, Closing, TeaserScenes
    components/              BrowserFrame/PhoneFrame/DocFrame, ScreenshotCamera, AnimatedHeadline, Pop, StepList, ...
    config/                  branding (colours, fonts), timing (scene seconds), assets (capture catalogue), fonts
    locales/                 en.ts, fr.ts (all visible copy + narration), types.ts
    audio/                   manifest.ts (narration plan), subtitles.ts, status.json, en/ fr/ (drop narration here)
  scripts/                   prepare-assets, render, validate, sync-audio
```

* One set of scenes; every scene takes a `locale` and reads `COPY[locale]` and `shotSrc(locale, key)`. EN never falls back to FR copy or screenshots (`validate` checks this).
* Screenshots are the **original PNG captures** in `docs/demo-journey/captures/{en,fr}`, copied byte-for-byte to `public/assets/` by `prepare:assets`. They are only scaled, cropped and panned (`ScreenshotCamera`); the pixels are never edited or redrawn. Overlays (chips, headlines) sit outside the screenshot.
* Honest provenance (see `docs/demo-journey/validation.md`): inspection and estimate are shown as separate sample visits ("Sample visits" chip; capture 11 carries "Another sample visit"), views 12 and 22 are not used, and the closing card says the shop is a sample and that sample records are in Québec French. Camera moves never imply a continuous transaction.
* Brand: Deep Navy `#07182F`, Primary Blue `#1769FF`, Bright Blue `#2583FF`. Logo = the official connected-module mark (`garageos-brand-kit/marks/garageos-imagotipo.png`) plus the "GarageOS" wordmark set in Oswald (the site's display font, bundled locally via `@fontsource/oswald`; body type Inter via `@fontsource/inter`). The brand kit's horizontal logo is documented as defective (invisible "Garage"), so the same mark + live-text composition used by the website header is used here.

## Commands

Run from the repo root (`npm run video:*`) or from `video/` (drop the `video:` prefix and use `npm run <name>`).

```bash
npm run video:install            # npm install in video/ + copy captures/fonts into video/public/assets
npm run video:studio             # Remotion Studio (preview all 6 compositions; pick full-en / full-fr / teaser-en / teaser-fr)
npm run video:render:en          # -> video/output/full-en.mp4
npm run video:render:fr          # -> video/output/full-fr.mp4
npm run video:render:teaser:en   # -> video/output/teaser-en.mp4
npm run video:render:teaser:fr   # -> video/output/teaser-fr.mp4
npm run video:render:all         # four videos + both thumbnails
npm run video:thumbnails         # video/output/thumbnail-{en,fr}.png
npm run video:validate           # static checks + ffprobe of any rendered MP4
# inside video/ only:
npm run render -- stills         # review frames: output/stills/<id>-<scene>-<pct>.png  (STILL_FRACS=0.3,0.85 to choose moments)
npm run typecheck
```

Rendering needs Node ≥ 22, FFmpeg/FFprobe (for `validate` and `audio:sync`) and a headless Chromium. Remotion normally downloads its own; set `REMOTION_BROWSER_EXECUTABLE=/path/to/headless_shell` to use another build (the render script auto-detects a Playwright headless shell under `/opt/pw-browsers`).

## Editing

* **Copy / translations**: `src/locales/en.ts` and `fr.ts` (same shape, enforced by TypeScript and `validate`). Headlines auto-fit (`fitHeadline`) down to a minimum size so long French text never clips; keep headlines ≤ 62 characters.
* **Screenshots**: change the `shot=` key in the scene file; keys are the capture names (`SHOTS` in `config/assets.ts`). Camera focus is `{x, y, zoom}` in image-normalised coordinates.
* **Scene timing**: `src/config/timing.ts` (`FULL_SCENES`, `TEASER_SCENES`, seconds; totals must stay 60 s / 15 s, `validate` fails otherwise). Inside a scene, beats are frame numbers at the top of each scene file (`STARTS`, `Pop start/end`).
* **Optional cinematic opening (Runway/Kling)**: render the clip to `video/public/opening/<locale>.mp4`, then in `scenes/Opening.tsx` add `<OffthreadVideo src={staticFile("opening/en.mp4")} />` as a first layer and lengthen the hook in `timing.ts`. Not required; nothing is generated here.

## Narration (ElevenLabs-ready)

The plan lives in `src/audio/manifest.ts`: for every scene and locale it exposes scene id, language, script, planned start/end, expected duration, target file path and status (`missing` | `ready`). Today every segment is `missing`; renders are silent and no synthetic voice is used. Subtitles (burned in, because email video usually autoplays muted) are timed provisionally from word counts; in Studio they are tagged "(provisional timing)".

1. Generate each segment from the scripts in `src/locales/{en,fr}.ts` (`narration`, `teaserNarration`) with the chosen ElevenLabs voice (use a Québec French voice for FR).
2. Save as WAV: `src/audio/<locale>/scene-01.wav … scene-06.wav` and `teaser-01.wav … teaser-05.wav`.
3. `npm run audio:sync` (inside `video/`): copies to `public/audio/`, measures durations with ffprobe, updates `src/audio/status.json`. Narration windows and subtitle cues are recomputed from the real durations; no scene code changes.
4. `npm run validate` flags any narration that would run past the end of its scene; adjust `timing.ts` seconds or shorten the script.
5. Re-render.

Narration starts 0.4 s after its scene (`NARRATION_LEAD_SEC`) so the headline lands first.

**Music**: put a *licensed* track at `video/public/music/bed.mp3` and set `MUSIC.enabled = true` (and `volume`) in `src/audio/manifest.ts`. No music is bundled and none is required.

## Known limitations

* Subtitle timing is an estimate until real narration exists.
* The English campaign editor, shop records and some product data are Québec French (the capture set is seeded in French; see `docs/demo-journey/validation.md`). The EN closing card says so. Capture 20 (campaign email) is not used because EN reuses a French example.
* Dashboard captures show the product's real "-52.1 % vs last month" figure; it is untouched.
* No audio is mixed yet; the draft MP4s have no audio track.
* The mark PNG in the brand kit has minor edge noise at full size (documented in the brand kit); it is only shown at ≤ 116 px height.

## Final production checklist

- [ ] Final narration WAVs (EN + FR) synced; `validate` green; subtitle cues reviewed against audio.
- [ ] Licensed music (optional) added and ducked under narration.
- [ ] Native review of FR copy and of EN copy (Canadian spelling).
- [ ] Re-capture screenshots if the product UI changed (`docs/demo-journey`), then `npm run prepare:assets`.
- [ ] Watch all four MP4s end to end; check thumbnails.
- [ ] Hosting/tracking/email embedding is out of scope here (later stage).
