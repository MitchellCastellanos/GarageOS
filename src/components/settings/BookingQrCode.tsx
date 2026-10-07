"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";
import { drawBookingQr, QR_SIZE } from "@/lib/booking-qr-canvas";

interface BookingQrCodeProps {
  bookingUrl: string | null;
  logoUrl: string | null;
  shopName: string;
}

export function BookingQrCode({ bookingUrl, logoUrl, shopName }: BookingQrCodeProps) {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale].qr;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!bookingUrl || !canvasRef.current) return;
    let cancelled = false;
    setReady(false);

    async function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      await drawBookingQr(canvas, bookingUrl as string, logoUrl, () => cancelled);
      if (!cancelled) setReady(true);
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [bookingUrl, logoUrl]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const link = document.createElement("a");
      const safeName = shopName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "taller";
      link.download = `qr-${safeName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      // Canvas "tainted" — el logo se cargó sin CORS y el navegador bloquea
      // leer los píxeles de vuelta para exportar el PNG.
      toast.error(t.downloadError);
    }
  }

  if (!bookingUrl) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">{t.title}</h2>
        <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
      </div>
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-56 h-56 sm:w-64 sm:h-64 overflow-hidden rounded-lg border border-slate-100">
          <canvas ref={canvasRef} width={QR_SIZE} height={QR_SIZE} className="block w-full h-full" />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={download}
          disabled={!ready}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg"
        >
          <Download className="w-4 h-4" />
          {t.download}
        </button>
      </div>
    </div>
  );
}
