"use client";

import { useEffect } from "react";

/** Cierra un panel flotante al hacer click fuera de sus `containers`, al
 * presionar Escape, o al redimensionar la ventana (la posición calculada del
 * panel quedaría vieja). Usado por los paneles de flyout y dos columnas. */
export function useOutsideClose(
  active: boolean,
  onClose: () => void,
  containers: React.RefObject<HTMLElement | null>[]
) {
  useEffect(() => {
    if (!active) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (containers.some((ref) => ref.current?.contains(target))) return;
      onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onClose);
    };
  }, [active, onClose, containers]);
}
