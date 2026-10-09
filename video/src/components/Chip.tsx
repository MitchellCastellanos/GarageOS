import React from "react";
import { BRAND, FONT_BODY } from "../config/branding";

/** Small honest-provenance label (e.g. "Another sample visit"). Separate from the screenshot pixels. */
export const Chip: React.FC<{ text: string; tone?: "light" | "blue"; size?: number }> = ({ text, tone = "light", size = 20 }) => (
  <div
    style={{
      display: "inline-block",
      fontFamily: FONT_BODY,
      fontWeight: 500,
      fontSize: size,
      color: tone === "blue" ? BRAND.white : BRAND.muted,
      background: tone === "blue" ? BRAND.blue : "rgba(255,255,255,0.08)",
      border: tone === "blue" ? "none" : "1px solid rgba(255,255,255,0.14)",
      borderRadius: 99,
      padding: `${size * 0.35}px ${size * 0.8}px`,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);
