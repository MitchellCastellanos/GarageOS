import React from "react";
import { Composition, Still } from "remotion";
import { VIDEO } from "./config/branding";
import { FULL_FRAMES, TEASER_FRAMES } from "./config/timing";
import { Explainer, Teaser } from "./compositions/Explainer";
import { Thumbnail } from "./compositions/Thumbnail";

const common = { fps: VIDEO.fps, width: VIDEO.width, height: VIDEO.height };

/** Composition ids are the single source for output filenames: output/<id>.mp4 */
export const COMPOSITIONS = [
  { id: "full-en", kind: "full", locale: "en", frames: FULL_FRAMES },
  { id: "full-fr", kind: "full", locale: "fr", frames: FULL_FRAMES },
  { id: "teaser-en", kind: "teaser", locale: "en", frames: TEASER_FRAMES },
  { id: "teaser-fr", kind: "teaser", locale: "fr", frames: TEASER_FRAMES },
] as const;

export const Root: React.FC = () => (
  <>
    {COMPOSITIONS.map((c) => (
      <Composition
        key={c.id}
        id={c.id}
        component={(c.kind === "full" ? Explainer : Teaser) as unknown as React.FC<Record<string, unknown>>}
        durationInFrames={c.frames}
        defaultProps={{ locale: c.locale, subtitles: true }}
        {...common}
      />
    ))}
    <Still id="thumbnail-en" component={Thumbnail} defaultProps={{ locale: "en" as const }} width={VIDEO.width} height={VIDEO.height} />
    <Still id="thumbnail-fr" component={Thumbnail} defaultProps={{ locale: "fr" as const }} width={VIDEO.width} height={VIDEO.height} />
  </>
);
