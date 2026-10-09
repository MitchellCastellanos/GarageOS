import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BRAND, FONT_BODY, FONT_DISPLAY } from "../config/branding";
import { COPY, type Locale } from "../locales";
import { BrowserFrame } from "../components/Frames";
import { AnimatedHeadline } from "../components/AnimatedHeadline";
import { BrandBackground } from "../components/BrandBackground";
import { Logo } from "../components/Logo";
import { Chip } from "../components/Chip";
import { easeInOut, lerp, prog } from "../components/motion";

// Chip rest positions (centre-relative) before they converge into the product.
const REST = [
  { x: -560, y: 150 },
  { x: -280, y: 230 },
  { x: 0, y: 150 },
  { x: 280, y: 230 },
  { x: 560, y: 150 },
];

export const Opening: React.FC<{ locale: Locale }> = ({ locale }) => {
  const c = COPY[locale];
  const f = useCurrentFrame();
  const converge = prog(f, 92, 132, easeInOut); // chips -> centre
  const headOut = prog(f, 96, 128, easeInOut);
  const dash = prog(f, 104, 150);
  return (
    <AbsoluteFill>
      <BrandBackground glowX={50} glowY={55} />
      <div style={{ position: "absolute", left: 96, top: 70 }}>
        <Logo size={44} />
      </div>

      {/* Phase A: headline + the five operational areas */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 250 - headOut * 60, opacity: 1 - headOut, display: "flex", justifyContent: "center" }}>
        <AnimatedHeadline text={c.hook.headline} width={1380} maxLines={2} maxSize={96} minSize={54} align="center" start={6} />
      </div>
      {c.hook.areas.map((a, i) => {
        const appear = prog(f, 40 + i * 6, 62 + i * 6);
        const x = lerp(REST[i].x, 0, converge);
        const y = lerp(REST[i].y + 340, 560, converge) + (1 - appear) * 30;
        return (
          <div
            key={a}
            style={{
              position: "absolute",
              left: 960 + x,
              top: y,
              transform: `translate(-50%, -50%) scale(${lerp(1.5, 0.7, converge)})`,
              opacity: appear * (1 - prog(f, 118, 136)),
            }}
          >
            <Chip text={a} tone={i % 2 ? "light" : "blue"} size={30} />
          </div>
        );
      })}

      {/* Phase B: the real dashboard, one connected experience */}
      <div
        style={{
          position: "absolute",
          left: 960 - 480,
          top: lerp(300, 135, dash),
          opacity: dash,
          transform: `scale(${lerp(0.86, 1, dash)})`,
        }}
      >
        <BrowserFrame locale={locale} shot="01-dashboard-desktop" width={960} from={{ x: 0.5, y: 0.35, zoom: 1.0 }} to={{ x: 0.5, y: 0.42, zoom: 1.08 }} t={prog(f, 130, 195, easeInOut)} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 132, textAlign: "center", opacity: prog(f, 150, 175) }}>
        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 36, letterSpacing: 3, color: BRAND.brightBlue, textTransform: "uppercase" }}>{c.hook.tag}</span>
        <span style={{ fontFamily: FONT_BODY, fontSize: 20, color: BRAND.muted, marginLeft: 24 }}>{c.provenance.sampleShop}</span>
      </div>
    </AbsoluteFill>
  );
};
