"use client";

import { ArrowDown, ArrowRight } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { useDemoViewer } from "@/components/marketing/demo/DemoViewer";
import {
  DEMO_UI, demoMessage, invoicePdfUrl, resolveDemoAsset, type DemoAssetKey, type DemoMessageKey,
} from "@/lib/demo-journey";

const SHOP_NAME = "Garage Laurent";

/** Marco de teléfono + burbuja SMS construidos en CSS con el texto real de los formateadores del producto. */
export function DemoPhoneSms({ messageKey, linkTarget, badge }: { messageKey: DemoMessageKey; linkTarget?: DemoAssetKey; badge?: string }) {
  const { locale } = useMarketingLocale();
  const ui = DEMO_UI[locale];
  const { open } = useDemoViewer();
  const message = demoMessage(messageKey, locale);

  const target = linkTarget ? resolveDemoAsset(linkTarget, locale) : null;
  const pdfUrl = linkTarget === "15-invoice-pdf-page" ? invoicePdfUrl(locale) : null;
  const action: (() => void) | null = target ? () => open({ asset: target, pdfUrl }) : null;

  const parts = message.link ? message.text.split(message.link) : [message.text];
  const linkClass = "rounded bg-amber-200/70 px-1 font-semibold text-blue-700 underline decoration-2 underline-offset-2 ring-2 ring-amber-400/60";

  return (
    <div className="mx-auto w-full max-w-[17.5rem]">
      <div className="rounded-[2rem] border-4 border-slate-900 bg-slate-900 p-1.5 shadow-xl">
        <div className="rounded-[1.5rem] bg-slate-50 px-3 pb-5 pt-3">
          <div className="mb-3 border-b border-slate-200 pb-2 text-center">
            <p className="text-xs font-semibold text-slate-800">{SHOP_NAME}</p>
            <p className="text-[10px] text-slate-500">{ui.phoneLabel}</p>
          </div>
          <div className="rounded-2xl rounded-tl-sm bg-slate-200 px-3 py-2.5 text-[13px] leading-snug text-slate-900">
            {parts.map((part, i) => (
              <span key={i}>
                {part}
                {i < parts.length - 1 && message.link && (
                  action ? (
                    <button type="button" onClick={action} className={`${linkClass} cursor-pointer break-all hover:bg-amber-300`}>{message.link}</button>
                  ) : (
                    <span className={`${linkClass} break-all`}>{message.link}</span>
                  )
                )}
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">{ui.exampleMessage}</span>
            {badge && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">{badge}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** SMS → flecha → documento. En móvil se apila verticalmente (origen, flecha, destino). */
export function DemoSmsToDocument({ messageKey, assetKey, badge, children }: {
  messageKey: DemoMessageKey; assetKey: DemoAssetKey; badge?: string; children: React.ReactNode;
}) {
  const { locale } = useMarketingLocale();
  const ui = DEMO_UI[locale];
  const hasDestination = resolveDemoAsset(assetKey, locale) !== null;
  return (
    <div className="grid items-center gap-4 md:grid-cols-[minmax(0,17.5rem)_auto_minmax(0,1fr)] md:gap-6">
      <DemoPhoneSms messageKey={messageKey} linkTarget={hasDestination ? assetKey : undefined} badge={badge} />
      {hasDestination && (
        <>
          <div role="img" aria-label={ui.arrowLabel} className="flex justify-center text-amber-600">
            <ArrowDown className="h-9 w-9 md:hidden" aria-hidden />
            <ArrowRight className="hidden h-12 w-12 md:block" aria-hidden />
          </div>
          <div className="mx-auto w-full max-w-md md:max-w-none">{children}</div>
        </>
      )}
    </div>
  );
}
