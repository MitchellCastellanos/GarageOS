import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BRAND } from "../config/branding";

/** Deep-navy field with a slow blue glow and the faint diagonal-module motif from the brand pattern. */
export const BrandBackground: React.FC<{ glowX?: number; glowY?: number; intensity?: number }> = ({
  glowX = 72,
  glowY = 40,
  intensity = 1,
}) => {
  const f = useCurrentFrame();
  const drift = Math.sin(f / 90) * 4;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${BRAND.navyLift} 0%, ${BRAND.navy} 45%, ${BRAND.navyDeep} 100%)` }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 700px at ${glowX + drift}% ${glowY}%, rgba(23,105,255,${0.28 * intensity}), transparent 70%)`,
        }}
      />
      <svg width="100%" height="100%" viewBox="0 0 1920 1080" style={{ position: "absolute", opacity: 0.06 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <rect
            key={i}
            x={-200 + i * 520}
            y={380 - (i % 2) * 260 + drift * 2}
            width={200}
            height={900}
            rx={100}
            transform={`rotate(38 ${-100 + i * 520} 800)`}
            fill={BRAND.brightBlue}
          />
        ))}
      </svg>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(2,8,18,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};
