"use client";

import { forwardRef } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RailNavGroup } from "./types";

export const RailCategoryButton = forwardRef<
  HTMLButtonElement,
  {
    group: RailNavGroup;
    expanded: boolean;
    onClick: () => void;
    ariaControls: string;
    /** El acordeón expande in-place (la flecha indica esa dirección); flyout y
     * dos columnas abren un panel aparte, sin necesidad de la flecha. */
    showChevron?: boolean;
  }
>(function RailCategoryButton({ group, expanded, onClick, ariaControls, showChevron }, ref) {
  const Icon = group.icon;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={group.label}
      aria-haspopup={showChevron ? undefined : "menu"}
      aria-expanded={expanded}
      aria-controls={ariaControls}
      className={cn(
        "relative flex items-center justify-center w-11 h-11 rounded-xl transition-colors flex-shrink-0",
        group.active || expanded
          ? "bg-blue-600 text-white"
          : "text-slate-400 hover:text-white hover:bg-slate-800"
      )}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {group.unread && (
        <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-slate-900" />
      )}
      {showChevron && (
        <ChevronRight
          className={cn(
            "absolute -right-1 -bottom-1 w-3 h-3 rounded-full bg-slate-900 text-slate-500 transition-transform",
            expanded && "rotate-90 text-white"
          )}
        />
      )}
    </button>
  );
});
