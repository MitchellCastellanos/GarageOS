import React, { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import { fillTextBox } from "@remotion/layout-utils";
import { BRAND, FONT_DISPLAY } from "../config/branding";
import { easeOut, lerp, prog } from "./motion";

/** Largest font size (<= max) at which `text` fits in `maxLines` lines of `width`; never below `min`. */
export function fitHeadline(text: string, width: number, maxLines: number, max: number, min: number, weight = 600) {
  for (let size = max; size >= min; size -= 2) {
    const box = fillTextBox({ maxBoxWidth: width, maxLines });
    const r = box.add({ text, fontFamily: "GarageOS Oswald", fontSize: size, fontWeight: String(weight) });
    if (!r.exceedsBox) return { size, fits: true };
  }
  return { size: min, fits: false };
}

/** Word-by-word reveal. Font size is fitted so long French copy never clips or overflows. */
export const AnimatedHeadline: React.FC<{
  text: string;
  width: number;
  maxLines?: number;
  maxSize?: number;
  minSize?: number;
  start?: number;
  align?: "left" | "center";
  color?: string;
  accentLast?: boolean;
}> = ({ text, width, maxLines = 3, maxSize = 76, minSize = 40, start = 0, align = "left", color = BRAND.white }) => {
  const f = useCurrentFrame();
  const { size } = useMemo(() => fitHeadline(text, width, maxLines, maxSize, minSize), [text, width, maxLines, maxSize, minSize]);
  const words = text.split(" ");
  return (
    <div
      style={{
        width,
        fontFamily: FONT_DISPLAY,
        fontWeight: 600,
        fontSize: size,
        lineHeight: 1.1,
        letterSpacing: 0.4,
        color,
        textAlign: align,
        textShadow: "0 4px 30px rgba(0,10,30,0.45)",
      }}
    >
      {words.map((w, i) => {
        const p = prog(f, start + i * 3, start + i * 3 + 20, easeOut);
        return (
          <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${lerp(26, 0, p)}px)`, marginRight: "0.26em" }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};
