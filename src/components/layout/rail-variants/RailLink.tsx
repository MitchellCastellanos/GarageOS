"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RailNavItem } from "./types";

export function RailLink({ href, label, icon: Icon, active, locked, unread }: RailNavItem) {
  // El riel de íconos se puede volver scrolleable (más items de los que caben
  // en pantallas bajas) — un tooltip que dependiera del `overflow` del
  // contenedor quedaría cortado o forzaría scroll horizontal. Por eso el
  // tooltip se manda por portal a <body> con posición fija, calculada del ícono.
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);

  function showTooltip() {
    const rect = linkRef.current?.getBoundingClientRect();
    if (rect) setTooltipPos({ top: rect.top + rect.height / 2, left: rect.right + 12 });
  }
  function hideTooltip() {
    setTooltipPos(null);
  }

  // Si el riel se scrollea mientras el tooltip está abierto, la posición
  // calculada queda vieja — más simple cerrarlo que reposicionarlo en cada
  // scroll. "scroll" no burbujea, pero sí se puede capturar en la fase de
  // captura desde un ancestro (aquí window) aunque no bubblee.
  useEffect(() => {
    if (!tooltipPos) return;
    window.addEventListener("scroll", hideTooltip, true);
    return () => window.removeEventListener("scroll", hideTooltip, true);
  }, [tooltipPos]);

  return (
    <Link
      ref={linkRef}
      href={href}
      aria-label={label}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      className={cn(
        "relative flex items-center justify-center w-11 h-11 rounded-xl transition-colors flex-shrink-0",
        active
          ? "bg-blue-600 text-white"
          : "text-slate-400 hover:text-white hover:bg-slate-800"
      )}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {locked && (
        <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center">
          <Lock className="w-2 h-2" />
        </span>
      )}
      {unread && !locked && (
        <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-slate-900" />
      )}
      {tooltipPos &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            style={{ position: "fixed", top: tooltipPos.top, left: tooltipPos.left, transform: "translateY(-50%)" }}
            className="pointer-events-none whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg z-50"
          >
            {label}
            {locked && <span className="text-amber-400 ml-1">· Pro</span>}
            {unread && !locked && <span className="text-red-400 ml-1">· nuevo</span>}
          </span>,
          document.body
        )}
    </Link>
  );
}
