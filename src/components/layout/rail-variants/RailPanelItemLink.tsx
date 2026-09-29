"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RailNavItem } from "./types";

/** Fila de sub-ítem dentro de un panel flotante (flyout / dos columnas) — mismo
 * patrón visual que `MobileNavLink` del drawer, para no inventar un tercer estilo. */
export function RailPanelItemLink({ item, onNavigate }: { item: RailNavItem; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      role="menuitem"
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap",
        item.active ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {item.label}
      {item.locked && (
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400">
          <Lock className="w-3 h-3" />
          Pro
        </span>
      )}
      {item.unread && !item.locked && <span className="ml-auto w-2 h-2 rounded-full bg-red-500" />}
    </Link>
  );
}
