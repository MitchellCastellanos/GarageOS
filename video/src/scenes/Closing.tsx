import React from "react";
import { AbsoluteFill, Img, useCurrentFrame } from "remotion";
import { BRAND, FONT_BODY, FONT_DISPLAY } from "../config/branding";
import { COPY, type Locale } from "../locales";
import { shotSrc, type ShotKey } from "../config/assets";
import { AnimatedHeadline } from "../components/AnimatedHeadline";
import { BrandBackground } from "../components/BrandBackground";
import { Logo } from "../components/Logo";
import { easeInOut, lerp, prog } from "../components/motion";

const TILES: { key: ShotKey; w: number; h: number; x: number; y: number; rot: number }[] = [
  { key: "01-dashboard-desktop", w: 520, h: 361, x: -560, y: -260, rot: -4 },
  { key: "02-agenda-desktop", w: 520, h: 361, x: 0, y: -330, rot: 2 },
  { key: "13-work-order-desktop", w: 520, h: 361, x: 560, y: -250, rot: 4 },
  { key: "10-estimate-editor-desktop", w: 520, h: 361, x: -540, y: 250, rot: 3 },
  { key: "17-payment-record-desktop", w: 520, h: 361, x: 0, y: 320, rot: -2 },
  { key: "21-campaign-editor-desktop", w: 520, h: 361, x: 540, y: 260, rot: -4 },
];

export const Closing: React.FC<{ locale: Locale }> = ({ locale }) => {
  const c = COPY[locale];
  const f = useCurrentFrame();
  const collapse = prog(f, 44, 96, easeInOut);
  return (
    <AbsoluteFill>
      <BrandBackground glowX={50} glowY={50} intensity={1.3} />
      {TILES.map((t, i) => {
        const a = prog(f, i * 4, i * 4 + 26);
        return (
          <div
            key={t.key}
            style={{
              position: "absolute",
              left: 960 + lerp(t.x, 0, collapse),
              top: 540 + lerp(t.y, 0, collapse),
              width: t.w,
              height: t.h,
              borderRadius: 14,
              overflow: "hidden",
              opacity: a * (1 - prog(f, 50, 84)),
              transform: `translate(-50%,-50%) rotate(${lerp(t.rot, 0, collapse)}deg) scale(${lerp(lerp(0.9, 1, a), 0.5, collapse)})`,
              boxShadow: "0 30px 60px -20px rgba(0,8,24,0.7)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <Img src={shotSrc(locale, t.key)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
          </div>
        );
      })}

      <div style={{ position: "absolute", left: 0, right: 0, top: 215, display: "flex", justifyContent: "center", opacity: prog(f, 70, 96), transform: `scale(${lerp(0.9, 1, prog(f, 70, 100))})` }}>
        <Logo size={116} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 410, display: "flex", justifyContent: "center" }}>
        <AnimatedHeadline text={c.closing.headline} width={1500} maxLines={2} maxSize={78} minSize={46} align="center" start={92} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, display: "flex", flexDirection: "column", alignItems: "center", gap: 26, opacity: prog(f, 124, 146), transform: `translateY(${lerp(20, 0, prog(f, 124, 148))}px)` }}>
        <div style={{ fontFamily: FONT_BODY, fontWeight: 600, fontSize: 40, color: BRAND.white, background: BRAND.blue, borderRadius: 99, padding: "22px 56px", boxShadow: "0 20px 50px -12px rgba(23,105,255,0.6)" }}>
          {c.closing.cta}
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 52, letterSpacing: 2, color: BRAND.brightBlue }}>{c.closing.website}</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 125, textAlign: "center", fontFamily: FONT_BODY, fontSize: 20, color: BRAND.muted, opacity: prog(f, 140, 160) }}>
        {c.closing.sampleNote}
      </div>
    </AbsoluteFill>
  );
};
