import React from "react";
import { AbsoluteFill } from "remotion";
import { BRAND, FONT_DISPLAY } from "../config/branding";
import { COPY, type Locale } from "../locales";
import { FontGate } from "../config/fonts";
import { BrandBackground } from "../components/BrandBackground";
import { BrowserFrame, PhoneFrame } from "../components/Frames";
import { AnimatedHeadline } from "../components/AnimatedHeadline";
import { Logo } from "../components/Logo";

/** 1920x1080 still for email/landing previews: brand, localized headline, real screens, discreet play affordance. */
export const Thumbnail: React.FC<{ locale: Locale }> = ({ locale }) => {
  const c = COPY[locale];
  return (
    <FontGate>
      <AbsoluteFill>
        <BrandBackground glowX={72} glowY={50} />
        <div style={{ position: "absolute", left: 90, top: 70 }}>
          <Logo size={48} />
        </div>
        <div style={{ position: "absolute", left: 90, top: 270 }}>
          <AnimatedHeadline text={c.closing.headline} width={720} maxLines={4} maxSize={100} minSize={52} start={-60} />
        </div>
        <div style={{ position: "absolute", left: 800, top: 210 }}>
          <BrowserFrame locale={locale} shot="01-dashboard-desktop" width={900} from={{ x: 0.5, y: 0.36, zoom: 1 }} />
        </div>
        <div style={{ position: "absolute", left: 1520, top: 330 }}>
          <PhoneFrame locale={locale} shot="04-booking-mobile" width={290} from={{ x: 0.5, y: 0.3, zoom: 1 }} />
        </div>
        <div style={{ position: "absolute", left: 90, bottom: 80, display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{ width: 84, height: 84, borderRadius: 84, background: BRAND.blue, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 16px 40px -8px rgba(23,105,255,0.7)" }}>
            <div style={{ marginLeft: 8, width: 0, height: 0, borderTop: "20px solid transparent", borderBottom: "20px solid transparent", borderLeft: `32px solid ${BRAND.white}` }} />
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: 40, letterSpacing: 2, color: BRAND.brightBlue }}>{c.closing.website}</div>
        </div>
      </AbsoluteFill>
    </FontGate>
  );
};
