"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface ScaledPreviewProps {
  /** Ancho "real" al que se renderiza la página (1280 escritorio, 390 teléfono). */
  virtualWidth: number;
  /** Alto visible del marco, en px de pantalla. */
  height: number;
  /** false = miniatura estática (sin scroll ni interacción). */
  interactive?: boolean;
  children: ReactNode;
}

/**
 * Marco del preview: renderiza la página a un ancho real y la escala para
 * que quepa. Las plantillas usan container queries, así que a 390 px se ven
 * exactamente como en un teléfono aunque el admin esté en escritorio.
 *
 * El `transform` del marco lo vuelve containing block de los elementos
 * `fixed` (botón de WhatsApp) — quedan dentro del preview y no del admin.
 * El scroll va en un hijo para que ese botón no se desplace con el contenido.
 */
export function ScaledPreview({ virtualWidth, height, interactive = true, children }: ScaledPreviewProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / virtualWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [virtualWidth]);

  const scaledWidth = scale ? virtualWidth * scale : 0;

  return (
    <div ref={outerRef} className="relative w-full overflow-hidden" style={{ height }}>
      {scale > 0 && (
        <div
          className="absolute top-0 bg-white"
          style={{
            left: `calc(50% - ${scaledWidth / 2}px)`,
            width: virtualWidth,
            height: height / scale,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          inert={!interactive}
        >
          <div
            className={interactive ? "h-full overflow-y-auto overscroll-contain" : "h-full overflow-hidden pointer-events-none"}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
