"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { RailCategoryButton } from "./RailCategoryButton";
import { RailPanelItemLink } from "./RailPanelItemLink";
import { useOutsideClose } from "./useOutsideClose";
import type { RailNavGroup } from "./types";

/** Opción 3 del doc: el riel solo muestra los 4 íconos de categoría, nunca
 * sub-ítems en el riel mismo. Click abre un panel flotante a la derecha
 * (evolución del tooltip por portal que ya usa RailLink) con los sub-ítems.
 * El riel nunca cambia de tamaño → cero riesgo de scroll. */
export function FlyoutRail({ groups }: { groups: RailNavGroup[] }) {
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const buttonsContainerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  function toggle(group: RailNavGroup) {
    if (openLabel === group.label) {
      setOpenLabel(null);
      return;
    }
    const rect = buttonRefs.current[group.label]?.getBoundingClientRect();
    if (rect) setPanelPos({ top: rect.top, left: rect.right + 12 });
    setOpenLabel(group.label);
  }

  function close() {
    setOpenLabel(null);
  }

  const openGroup = groups.find((group) => group.label === openLabel) ?? null;

  useOutsideClose(openLabel !== null, close, [panelRef, buttonsContainerRef]);

  return (
    <>
      <div ref={buttonsContainerRef} className="contents">
        {groups.map((group) => (
          <RailCategoryButton
            key={group.label}
            ref={(el) => {
              buttonRefs.current[group.label] = el;
            }}
            group={group}
            expanded={openLabel === group.label}
            ariaControls={`flyout-panel-${group.label}`}
            onClick={() => toggle(group)}
          />
        ))}
      </div>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {openGroup && panelPos && (
              <motion.div
                key={openGroup.label}
                ref={panelRef}
                id={`flyout-panel-${openGroup.label}`}
                role="menu"
                aria-label={openGroup.label}
                initial={{ opacity: 0, x: reducedMotion ? 0 : -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reducedMotion ? 0 : -8 }}
                transition={{ duration: reducedMotion ? 0 : 0.15 }}
                style={{ position: "fixed", top: panelPos.top, left: panelPos.left }}
                className="z-50 min-w-[200px] rounded-xl bg-slate-900 border border-slate-800 shadow-xl p-2"
              >
                <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {openGroup.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {openGroup.items.map((item) => (
                    <RailPanelItemLink key={item.href} item={item} onNavigate={close} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
