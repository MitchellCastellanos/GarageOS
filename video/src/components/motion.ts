import { Easing, interpolate } from "remotion";

export const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

/** Clamped eased progress 0..1 between two frames. */
export const prog = (frame: number, from: number, to: number, easing = easeOut) =>
  interpolate(frame, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
