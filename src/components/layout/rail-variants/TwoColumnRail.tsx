"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { RailCategoryButton } from "./RailCategoryButton";
import { RailPanelItemLink } from "./RailPanelItemLink";
import { useOutsideClose } from "./useOutsideClose";
import type { RailNavGroup } from "./types";

/** Opción 4 del doc: columna izquierda fija con las 4 categorías (el riel de
 * 72px de siempre); al seleccionar una, aparece una segunda columna pegada a
 * su derecha — fuera del riel, para no ensancharlo — con sus sub-íconos,
 * animada con slide horizontal. */
export function TwoColumnRail({
  groups,
  railRef,
}: {
  groups: RailNavGroup[];
  railRef: React.RefObject<HTMLElement | null>;
}) {
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const [columnRect, setColumnRect] = useState<{ top: number; left: number; height: number } | null>(null);
  const buttonsContainerRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  function toggle(group: RailNavGroup) {
    if (openLabel === group.label) {
      setOpenLabel(null);
      return;
    }
    const rect = railRef.current?.getBoundingClientRect();
    if (rect) setColumnRect({ top: rect.top, left: rect.right, height: rect.height });
    setOpenLabel(group.label);
  }

  function close() {
    setOpenLabel(null);
  }

  const openGroup = groups.find((group) => group.label === openLabel) ?? null;

  useOutsideClose(openLabel !== null, close, [columnRef, buttonsContainerRef]);

  return (
    <>
      <div ref={buttonsContainerRef} className="contents">
        {groups.map((group) => (
          <RailCategoryButton
            key={group.label}
            group={group}
            expanded={openLabel === group.label}
            ariaControls={`twocol-panel-${group.label}`}
            onClick={() => toggle(group)}
          />
        ))}
      </div>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {openGroup && columnRect && (
              <motion.div
                key={openGroup.label}
                ref={columnRef}
                id={`twocol-panel-${openGroup.label}`}
                role="menu"
                aria-label={openGroup.label}
                initial={{ opacity: 0, x: reducedMotion ? 0 : -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reducedMotion ? 0 : -16 }}
                transition={{ duration: reducedMotion ? 0 : 0.18, ease: "easeOut" }}
                style={{
                  position: "fixed",
                  top: columnRect.top,
                  left: columnRect.left,
                  height: columnRect.height,
                }}
                className="z-50 w-56 bg-slate-900 border-r border-slate-800 shadow-xl flex flex-col py-3 px-2 overflow-y-auto"
              >
                <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
