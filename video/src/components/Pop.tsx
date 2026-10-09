import React from "react";
import { useCurrentFrame } from "remotion";
import { easeInOut, lerp, prog } from "./motion";

/**
 * Enter/exit wrapper for a layer on the stage. Visible between `start` and `end` (frames in the
 * scene's local time). Enter slides/scales in with a restrained ease-out; exit fades and drifts.
 */
export const Pop: React.FC<{
  start: number;
  end?: number;
  dx?: number;
  dy?: number;
  enter?: number;
  exit?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ start, end = Infinity, dx = 0, dy = 40, enter = 22, exit = 16, style, children }) => {
  const f = useCurrentFrame();
  if (f < start - 1 || f > end + 1) return null;
  const a = prog(f, start, start + enter);
  const b = Number.isFinite(end) ? prog(f, end - exit, end, easeInOut) : 0;
  const opacity = a * (1 - b);
  const scale = lerp(0.965, 1, a) * lerp(1, 0.985, b);
  return (
    <div
      style={{
        position: "absolute",
        opacity,
        transform: `translate(${(1 - a) * dx}px, ${(1 - a) * dy - b * 12}px) scale(${scale})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
