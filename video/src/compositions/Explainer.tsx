import React from "react";
import { AbsoluteFill, Audio, Sequence, useVideoConfig } from "remotion";
import { FPS, FULL_SCENES, OVERLAP, TEASER_OVERLAP, TEASER_SCENES, sceneStarts } from "../config/timing";
import { FontGate } from "../config/fonts";
import { getSegments } from "../audio/manifest";
import { MIX, dbToLin, musicSrc, musicVolumeFn } from "../audio/music";
import { cuesFor } from "../audio/subtitles";
import type { Locale, SceneId, TeaserSceneId } from "../locales";
import { SceneFade } from "../components/SceneFade";
import { SubtitleOverlay } from "../components/SubtitleOverlay";
import { Opening } from "../scenes/Opening";
import { Scheduling } from "../scenes/Scheduling";
import { Inspection } from "../scenes/Inspection";
import { WorkOrders } from "../scenes/WorkOrders";
import { Retention } from "../scenes/Retention";
import { Closing } from "../scenes/Closing";
import { TEASER_COMPONENTS } from "../scenes/TeaserScenes";

const FULL_COMPONENTS: Record<SceneId, React.FC<{ locale: Locale }>> = {
  hook: Opening,
  booking: Scheduling,
  inspection: Inspection,
  work: WorkOrders,
  retention: Retention,
  closing: Closing,
};

export interface FilmProps {
  locale: Locale;
  subtitles?: boolean;
}

/** Shared timeline builder: scenes overlap by `overlap` frames for cross-fades; audio/subtitles from the manifest. */
const Film: React.FC<FilmProps & { variant: "full" | "teaser"; overlap: number }> = ({ locale, subtitles = true, variant, overlap }) => {
  const { durationInFrames } = useVideoConfig();
  const list = sceneStarts(variant === "full" ? FULL_SCENES : TEASER_SCENES);
  const segments = getSegments(locale, variant);
  const cues = segments.flatMap(cuesFor);
  return (
    <FontGate>
      <AbsoluteFill style={{ background: "#07182F" }}>
        {list.map((s, i) => {
          const lead = i === 0 ? 0 : overlap;
          const Comp = (variant === "full" ? FULL_COMPONENTS[s.id as SceneId] : TEASER_COMPONENTS[s.id as TeaserSceneId]) as React.FC<{ locale: Locale }>;
          return (
            <Sequence key={s.id} from={s.from - lead} durationInFrames={s.frames + lead} name={`${i + 1}-${s.id}`}>
              <SceneFade first={i === 0} last={i === list.length - 1} overlap={overlap}>
                <Comp locale={locale} />
              </SceneFade>
            </Sequence>
          );
        })}
        {subtitles ? <SubtitleOverlay cues={cues} /> : null}
        {segments.map((seg) =>
          seg.staticPath ? (
            <Sequence key={seg.sceneId} from={Math.round(seg.startSec * FPS)} name={`narration-${seg.sceneId}`}>
              <Audio src={seg.staticPath} volume={dbToLin(MIX.narrationGainDb[variant])} />
            </Sequence>
          ) : null,
        )}
        <Audio src={musicSrc(variant)} volume={musicVolumeFn(segments, variant, durationInFrames)} name={`music-${variant}`} />
      </AbsoluteFill>
    </FontGate>
  );
};

export const Explainer: React.FC<FilmProps> = (p) => <Film {...p} variant="full" overlap={OVERLAP} />;
export const Teaser: React.FC<FilmProps> = (p) => <Film {...p} variant="teaser" overlap={TEASER_OVERLAP} />;
