import React from "react";
import { BRAND } from "../config/branding";
import { ScreenshotCamera, type Focus } from "./ScreenshotCamera";
import { shotSrc, sizeOf, type ShotKey } from "../config/assets";
import type { Locale } from "../locales";

interface ShotProps {
  locale: Locale;
  shot: ShotKey;
  from: Focus;
  to?: Focus;
  t?: number;
}

const SHADOW = "0 50px 90px -20px rgba(0,8,24,0.75), 0 18px 36px -12px rgba(0,8,24,0.55)";

/** Desktop browser chrome. `width` is the screenshot viewport width; height follows the capture ratio (1.44). */
export const BrowserFrame: React.FC<ShotProps & { width: number }> = ({ locale, shot, from, to, t, width }) => {
  const { w, h } = sizeOf(locale, shot);
  const height = Math.round(width * (h / w));
  return (
    <div style={{ borderRadius: 18, overflow: "hidden", background: "#0E1F38", boxShadow: SHADOW, border: "1px solid rgba(255,255,255,0.10)", width }}>
      <div style={{ height: 38, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", background: "linear-gradient(#17304F,#102542)" }}>
        {["#FF6B63", "#FFC145", "#3CCB64"].map((c) => (
          <div key={c} style={{ width: 11, height: 11, borderRadius: 11, background: c, opacity: 0.85 }} />
        ))}
        <div style={{ marginLeft: 18, height: 20, flex: 1, maxWidth: width * 0.42, borderRadius: 10, background: "rgba(255,255,255,0.08)" }} />
      </div>
      <ScreenshotCamera src={shotSrc(locale, shot)} imgW={w} imgH={h} viewW={width} viewH={height} from={from} to={to} t={t} />
    </div>
  );
};

export const browserHeight = (locale: Locale, shot: ShotKey, width: number) => {
  const { w, h } = sizeOf(locale, shot);
  return Math.round(width * (h / w)) + 38;
};

/** Smartphone mock; the screen keeps the 780x1688 capture ratio, taller captures scroll via the camera. */
export const PhoneFrame: React.FC<ShotProps & { width: number }> = ({ locale, shot, from, to, t, width }) => {
  const { w, h } = sizeOf(locale, shot);
  const bezel = Math.round(width * 0.04);
  const screenW = width - bezel * 2;
  const screenH = Math.round(screenW * (1688 / 780));
  return (
    <div
      style={{
        width,
        padding: bezel,
        borderRadius: width * 0.14,
        background: "linear-gradient(145deg,#26385A,#0A1630)",
        boxShadow: SHADOW + ", inset 0 0 0 2px rgba(255,255,255,0.12)",
        position: "relative",
      }}
    >
      <div style={{ borderRadius: width * 0.11, overflow: "hidden" }}>
        <ScreenshotCamera src={shotSrc(locale, shot)} imgW={w} imgH={h} viewW={screenW} viewH={screenH} from={from} to={to} t={t} />
      </div>
      <div style={{ position: "absolute", top: bezel * 1.6, left: "50%", marginLeft: -width * 0.14, width: width * 0.28, height: width * 0.06, borderRadius: 99, background: "#050B18" }} />
    </div>
  );
};
export const phoneHeight = (width: number) => {
  const bezel = Math.round(width * 0.04);
  return Math.round((width - bezel * 2) * (1688 / 780)) + bezel * 2;
};

/** Plain paper card for emails and the invoice PDF page. */
export const DocFrame: React.FC<ShotProps & { width: number; height: number }> = ({ locale, shot, from, to, t, width, height }) => {
  const { w, h } = sizeOf(locale, shot);
  return (
    <div style={{ width, borderRadius: 14, overflow: "hidden", boxShadow: SHADOW, border: "1px solid rgba(255,255,255,0.14)", background: BRAND.white }}>
      <ScreenshotCamera src={shotSrc(locale, shot)} imgW={w} imgH={h} viewW={width} viewH={height} from={from} to={to} t={t} />
    </div>
  );
};
