import React from "react";
import { Img } from "remotion";
import { lerp } from "./motion";

export interface Focus {
  /** Focus centre in normalised image coordinates (0..1). */
  x: number;
  y: number;
  /** 1 = image width fills the viewport; >1 zooms in. */
  zoom: number;
}

/**
 * Fixed-size viewport onto an untouched screenshot. Only scale/translate are applied;
 * the pixels of the capture are never altered. `t` (0..1) moves the camera `from` -> `to`.
 */
export const ScreenshotCamera: React.FC<{
  src: string;
  imgW: number;
  imgH: number;
  viewW: number;
  viewH: number;
  from: Focus;
  to?: Focus;
  t?: number;
}> = ({ src, imgW, imgH, viewW, viewH, from, to = from, t = 0 }) => {
  const x = lerp(from.x, to.x, t);
  const y = lerp(from.y, to.y, t);
  const zoom = lerp(from.zoom, to.zoom, t);
  // never smaller than "cover" so no empty margins appear
  const base = Math.max(viewW / imgW, viewH / imgH);
  const scale = base * zoom;
  const dw = imgW * scale;
  const dh = imgH * scale;
  const tx = Math.min(0, Math.max(viewW - dw, viewW / 2 - x * dw));
  const ty = Math.min(0, Math.max(viewH - dh, viewH / 2 - y * dh));
  return (
    <div style={{ width: viewW, height: viewH, overflow: "hidden", position: "relative", background: "#fff" }}>
      <Img
        src={src}
        style={{ position: "absolute", left: 0, top: 0, width: dw, height: dh, transform: `translate(${tx}px, ${ty}px)`, maxWidth: "none" }}
      />
    </div>
  );
};
