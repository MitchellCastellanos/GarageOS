# Narration audio

Drop final narration here, one file per segment:

```
video/src/audio/en/scene-01.wav … scene-06.wav     (full, English)
video/src/audio/fr/scene-01.wav … scene-06.wav     (full, French)
video/src/audio/en/teaser-01.wav … teaser-05.wav   (teaser)
video/src/audio/fr/teaser-01.wav … teaser-05.wav
```

`video/public/audio/`, measures them with ffprobe and writes `status.json`. Subtitle and
narration windows are then recomputed from the real durations; no scene code changes.

Until a file exists the segment is `missing`, the render is silent for it, and subtitles
are marked provisional. No placeholder or synthetic voices are generated.
