"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { RailCategoryButton } from "./RailCategoryButton";
import { RailLink } from "./RailLink";
import type { RailNavGroup } from "./types";

/** Opción 1 del doc: solo se ven los 4 íconos de categoría en reposo; al
 * tocar uno se expande empujando a los demás, mostrando sus sub-íconos.
 * Solo una categoría abierta a la vez → el riel nunca crece más que una
 * categoría expandida, así que nunca hay overflow. */
export function AccordionRail({ groups }: { groups: RailNavGroup[] }) {
  const [openLabel, setOpenLabel] = useState<string | null>(
    () => groups.find((group) => group.active)?.label ?? null
  );
  const reducedMotion = useReducedMotion();

  return (
    <>
      {groups.map((group) => {
        const expanded = openLabel === group.label;
        return (
          <div key={group.label} className="w-full flex flex-col items-center">
            <RailCategoryButton
              group={group}
              expanded={expanded}
              showChevron
              ariaControls={`accordion-panel-${group.label}`}
              onClick={() => setOpenLabel(expanded ? null : group.label)}
            />
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  key="panel"
                  id={`accordion-panel-${group.label}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.18 }}
                  className="w-full overflow-hidden flex flex-col items-center"
                >
                  <div className="flex flex-col items-center gap-1.5 pt-1.5">
                    {group.items.map((item) => (
                      <RailLink key={item.href} {...item} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </>
  );
}
