"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
}

export function Tabs({ tabs, basePath }: { tabs: TabItem[]; basePath: string }) {
  const searchParams = useSearchParams();
  const groupId = useId();
  const reducedMotion = useReducedMotion();
  const activeTab = tabs.find((tab) => tab.id === searchParams.get("tab")) ?? tabs[0];
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeLinkRef = useRef<HTMLAnchorElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    function updateFades() {
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    }

    updateFades();
    el.addEventListener("scroll", updateFades, { passive: true });
    const resizeObserver = new ResizeObserver(updateFades);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", updateFades);
      resizeObserver.disconnect();
    };
  }, [tabs.length]);

  useEffect(() => {
    // En mobile, si la tab activa quedó fuera de vista (ej. llegaste por link directo), la trae a la vista.
    activeLinkRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTab?.id]);

  if (!activeTab) return null;

  return (
    <LayoutGroup id={groupId}>
      <div className="min-w-0">
        <div className="relative">
          <div ref={scrollerRef} className="flex gap-1 border-b border-slate-200 overflow-x-auto">
            {tabs.map((tab) => (
              <Link
                key={tab.id}
                ref={tab.id === activeTab.id ? activeLinkRef : undefined}
                href={`${basePath}?tab=${encodeURIComponent(tab.id)}`}
                scroll={false}
                aria-current={tab.id === activeTab.id ? "page" : undefined}
                className={cn(
                  "relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors shrink-0",
                  tab.id === activeTab.id
                    ? "text-blue-600"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                {tab.label}
                {tab.id === activeTab.id && (
                  <motion.div
                    layoutId="settings-tab-underline"
                    className="absolute left-0 right-0 bottom-0 h-0.5 bg-blue-600"
                    transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
              </Link>
            ))}
          </div>
          {/* Pista visual de que hay más tabs fuera de vista (mobile) */}
          {canScrollLeft && (
            <div className="pointer-events-none absolute left-0 top-0 bottom-[1px] w-6 bg-gradient-to-r from-slate-50 to-transparent sm:hidden" />
          )}
          {canScrollRight && (
            <div className="pointer-events-none absolute right-0 top-0 bottom-[1px] w-6 bg-gradient-to-l from-slate-50 to-transparent sm:hidden" />
          )}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab.id}
            initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
            transition={{ duration: reducedMotion ? 0 : 0.15 }}
            className="pt-6 min-w-0"
          >
            {activeTab.content}
          </motion.div>
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
