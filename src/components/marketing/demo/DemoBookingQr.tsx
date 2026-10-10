"use client";

import { useEffect, useRef } from "react";
import { LocaleLink as Link } from "@/components/marketing/LocaleLink";
import { ArrowRight } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { drawBookingQr, QR_SIZE } from "@/lib/booking-qr-canvas";
import { DEMO_BOOKING_PATH, DEMO_BOOKING_URL, DEMO_LOGO_SRC, DEMO_UI } from "@/lib/demo-journey";

/** QR real de la página de reservas del taller demo, con el logo del taller. Se pinta en el navegador; el logo es un asset local. */
export function DemoBookingQr() {
  const { locale } = useMarketingLocale();
  const ui = DEMO_UI[locale];
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    drawBookingQr(canvas, DEMO_BOOKING_URL, DEMO_LOGO_SRC, () => cancelled).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:p-6">
      <canvas
        ref={canvasRef}
        width={QR_SIZE}
        height={QR_SIZE}
        role="img"
        aria-label={ui.qrAlt}
        className="block h-48 w-48 shrink-0 rounded-lg border border-slate-100 sm:h-52 sm:w-52"
      />
      <div className="min-w-0 text-center sm:text-left">
        <h3 className="text-lg font-bold text-slate-900">{ui.qrTitle}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{ui.qrBody}</p>
        <Link
          href={`${DEMO_BOOKING_PATH}?lang=${locale}`}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-blue-dark focus-visible:outline-2 focus-visible:outline-brand-blue"
        >
          {ui.qrOpen}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <p className="mt-2 break-all text-xs text-slate-500">{DEMO_BOOKING_URL.replace("https://", "")}</p>
      </div>
    </div>
  );
}
