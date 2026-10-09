import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { OVERLAP } from "../config/timing";
import { lerp, prog } from "./motion";

/** Scene cross-fade: fades in over the first OVERLAP frames, out over the last (unless `last`). */
export const SceneFade: React.FC<{ first?: boolean; last?: boolean; overlap?: number; children: React.ReactNode }> = ({ first, last, overlap = OVERLAP, children }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const inP = first ? 1 : prog(f, 0, overlap);
  const outP = last ? 0 : prog(f, durationInFrames - overlap, durationInFrames);
  return (
    <AbsoluteFill style={{ opacity: inP * (1 - outP), transform: `scale(${lerp(1.012, 1, inP) * lerp(1, 0.992, outP)})` }}>
      {children}
    </AbsoluteFill>
  );
};
