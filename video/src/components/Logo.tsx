import React from "react";
import { Img } from "remotion";
import { BRAND, FONT_DISPLAY } from "../config/branding";
import { markSrc } from "../config/assets";

/** Official connected-module mark + GarageOS wordmark ("Garage" light on dark, "OS" in brand blue). */
export const Logo: React.FC<{ size?: number }> = ({ size = 64 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.28 }}>
    <Img src={markSrc()} style={{ height: size, width: "auto" }} />
    <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: size * 0.9, letterSpacing: size * 0.01, color: BRAND.white, lineHeight: 1 }}>
      Garage<span style={{ color: BRAND.brightBlue }}>OS</span>
    </div>
  </div>
);
