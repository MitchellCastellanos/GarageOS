import React, { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

const FACES: [string, string, string][] = [
  ["GarageOS Oswald", "500", "oswald-latin-500-normal.woff2"],
  ["GarageOS Oswald", "600", "oswald-latin-600-normal.woff2"],
  ["GarageOS Oswald", "700", "oswald-latin-700-normal.woff2"],
  ["GarageOS Inter", "500", "inter-latin-500-normal.woff2"],
  ["GarageOS Inter", "600", "inter-latin-600-normal.woff2"],
];

let loading: Promise<void> | null = null;
export function loadFonts(): Promise<void> {
  loading ??= Promise.all(
    FACES.map(async ([family, weight, file]) => {
      const face = new FontFace(family, `url(${staticFile(`assets/fonts/${file}`)}) format('woff2')`, { weight });
      await face.load();
      (document.fonts as unknown as { add(f: FontFace): void }).add(face);
    }),
  ).then(() => undefined);
  return loading;
}

/** Holds rendering until bundled (local) fonts are ready so text measuring and frames are deterministic. */
export const FontGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    loadFonts().then(() => {
      setReady(true);
      continueRender(handle);
    });
  }, [handle]);
  return ready ? <>{children}</> : null;
};
