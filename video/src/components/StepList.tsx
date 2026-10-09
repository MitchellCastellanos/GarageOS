import React from "react";
import { useCurrentFrame } from "remotion";
import { BRAND, FONT_BODY } from "../config/branding";
import { lerp, prog } from "./motion";

/** Vertical step indicator. `starts[i]` = frame step i becomes active. */
export const StepList: React.FC<{ steps: string[]; starts: number[]; width?: number; size?: number }> = ({ steps, starts, width = 560, size = 30 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ width, display: "flex", flexDirection: "column", gap: size * 0.55, fontFamily: FONT_BODY }}>
      {steps.map((s, i) => {
        const on = prog(f, starts[i], starts[i] + 14);
        const off = i + 1 < starts.length ? prog(f, starts[i + 1], starts[i + 1] + 14) : 0;
        const active = on * (1 - off);
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 18, opacity: lerp(0.4, 1, Math.max(active, on * 0.55)) }}>
            <div style={{ width: 12 + active * 10, height: 12, borderRadius: 12, background: active > 0.5 ? BRAND.brightBlue : "rgba(255,255,255,0.3)" }} />
            <div style={{ fontSize: size, fontWeight: active > 0.5 ? 600 : 500, color: BRAND.white }}>{s}</div>
          </div>
        );
      })}
    </div>
  );
};
