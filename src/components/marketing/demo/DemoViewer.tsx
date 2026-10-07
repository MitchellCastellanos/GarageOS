"use client";

import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Maximize2, X, ZoomIn } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { DEMO_UI, resolveDemoAsset, type DemoAssetKey, type ResolvedDemoAsset } from "@/lib/demo-journey";
import { PLAN_NAMES } from "@/lib/marketing-plans";

interface ViewerItem { asset: ResolvedDemoAsset; pdfUrl?: string | null }
interface ViewerApi { open: (item: ViewerItem) => void }

const ViewerContext = createContext<ViewerApi | null>(null);

export function useDemoViewer(): ViewerApi {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error("useDemoViewer must be used within DemoViewerProvider");
  return ctx;
}

/** Un solo diálogo modal nativo para toda la página: Escape cierra, el foco queda atrapado y vuelve al disparador. */
export function DemoViewerProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useMarketingLocale();
  const ui = DEMO_UI[locale];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const [item, setItem] = useState<ViewerItem | null>(null);
  const [fullSize, setFullSize] = useState(false);

  const open = useCallback((next: ViewerItem) => {
    triggerRef.current = document.activeElement;
    setFullSize(false);
    setItem(next);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (item && dialog && !dialog.open) dialog.showModal();
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [item]);

  function handleClose() {
    setItem(null);
    const trigger = triggerRef.current;
    if (trigger instanceof HTMLElement) trigger.focus();
  }

  return (
    <ViewerContext.Provider value={{ open }}>
      {children}
      <dialog
        ref={dialogRef}
        aria-label={ui.viewerLabel}
        onClose={handleClose}
        onClick={(e) => { if (e.target === dialogRef.current) dialogRef.current?.close(); }}
        className="m-auto h-[92vh] w-[96vw] max-w-6xl rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/70"
      >
        {item && (
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
              <p className="min-w-0 flex-1 text-sm font-medium text-slate-700">{item.asset.caption}</p>
              {item.pdfUrl && (
                <a href={item.pdfUrl} target="_blank" rel="noopener" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-brand-blue hover:bg-slate-50">{ui.openPdf}</a>
              )}
              <button type="button" onClick={() => setFullSize((v) => !v)} aria-pressed={fullSize}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Maximize2 className="h-4 w-4" aria-hidden />
                {fullSize ? ui.fitScreen : ui.fullSize}
              </button>
              <button type="button" autoFocus onClick={() => dialogRef.current?.close()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700">
                <X className="h-4 w-4" aria-hidden />
                {ui.close}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3 sm:p-6" tabIndex={0}>
              <Image
                src={item.asset.src} alt={item.asset.alt} width={item.asset.width} height={item.asset.height} unoptimized
                className={fullSize ? "mx-auto h-auto max-w-none" : "mx-auto h-auto max-h-full w-auto max-w-full object-contain"}
                style={fullSize ? { width: item.asset.width } : undefined}
              />
            </div>
          </div>
        )}
      </dialog>
    </ViewerContext.Provider>
  );
}

/** Captura clicable (abre el visor). Si el asset no existe en el manifiesto, no renderiza nada. */
export function DemoFigure({ assetKey, priority = false, sizes, className = "", showCaption = true, frame = true }: {
  assetKey: DemoAssetKey; priority?: boolean; sizes?: string; className?: string; showCaption?: boolean; frame?: boolean;
}) {
  const { locale } = useMarketingLocale();
  const ui = DEMO_UI[locale];
  const { open } = useDemoViewer();
  const asset = resolveDemoAsset(assetKey, locale);
  if (!asset) return null;
  const isPhone = asset.device === "mobile";
  return (
    <figure className={`min-w-0 ${className}`}>
      <div className="relative">
        <button type="button" onClick={() => open({ asset })} aria-label={`${ui.enlarge}: ${asset.alt}`}
          className={`group relative block w-full overflow-hidden text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue ${frame ? (isPhone ? "rounded-[1.75rem] border-4 border-slate-900 bg-slate-900 shadow-xl" : "rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10") : "rounded-lg"}`}>
          <Image
            src={asset.src} alt={asset.alt} width={asset.width} height={asset.height} unoptimized priority={priority}
            loading={priority ? undefined : "lazy"} sizes={sizes} className={`h-auto w-full ${isPhone ? "rounded-[1.25rem]" : ""}`}
          />
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold text-white opacity-90 transition-opacity group-hover:opacity-100">
            <ZoomIn className="h-3 w-3" aria-hidden />
            {ui.enlarge}
          </span>
        </button>
        {(asset.plan || asset.badge) && (
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {asset.plan && <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-brand-blue shadow">{ui.plan(PLAN_NAMES[asset.plan])}</span>}
            {asset.badge && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900 shadow">{asset.badge}</span>}
          </div>
        )}
      </div>
      {showCaption && (
        <figcaption className="mt-2 text-sm leading-snug text-slate-600">
          {asset.caption}
          {asset.reused && ui.reusedNote && <span className="block text-xs text-slate-500">{ui.reusedNote}</span>}
        </figcaption>
      )}
    </figure>
  );
}
