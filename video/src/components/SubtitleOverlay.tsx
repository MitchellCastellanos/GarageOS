import React from "react";
import { getRemotionEnvironment, useCurrentFrame } from "remotion";
import { BRAND, FONT_BODY } from "../config/branding";
import type { Cue } from "../audio/subtitles";

export const SubtitleOverlay: React.FC<{ cues: Cue[]; fontSize?: number }> = ({ cues, fontSize = 34 }) => {
  const f = useCurrentFrame();
  const cue = cues.find((c) => f >= c.from && f < c.to);
  if (!cue) return null;
  const a = Math.min(1, (f - cue.from) / 6, (cue.to - f) / 6);
  const studio = getRemotionEnvironment().isStudio;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 46, display: "flex", justifyContent: "center", opacity: a }}>
      <div
        style={{
          maxWidth: 1300,
          textAlign: "center",
          fontFamily: FONT_BODY,
          fontWeight: 500,
          fontSize,
          lineHeight: 1.3,
          color: BRAND.white,
          background: "rgba(4,14,29,0.78)",
          padding: "10px 28px 12px",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        {cue.text}
        {studio && cue.provisional ? <span style={{ marginLeft: 14, fontSize: 16, color: BRAND.muted }}>(provisional timing)</span> : null}
      </div>
    </div>
  );
};
