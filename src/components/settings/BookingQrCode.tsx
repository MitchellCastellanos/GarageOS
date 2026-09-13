"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, Loader2 } from "lucide-react";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";

interface BookingQrCodeProps {
  bookingUrl: string | null;
  logoUrl: string | null;
  shopName: string;
}

const QR_SIZE = 640;
// Máximo razonable de espacio para el logo sin arriesgar la legibilidad: con
// corrección de errores 'H' (~30%) el escáner sigue funcionando con esta
// proporción de módulos tapados en el centro.
const LOGO_RATIO = 0.22;
const LOGO_PADDING_RATIO = 0.035;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo load failed"));
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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

      await QRCode.toCanvas(canvas, bookingUrl as string, {
        errorCorrectionLevel: "H",
        margin: 2,
        width: QR_SIZE,
        color: { dark: "#131417", light: "#ffffff" },
      });

      if (logoUrl && !cancelled) {
        try {
          const img = await loadImage(logoUrl);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("no 2d context");

          const logoSize = QR_SIZE * LOGO_RATIO;
          const pad = QR_SIZE * LOGO_PADDING_RATIO;
          const boxSize = logoSize + pad * 2;
          const boxX = (QR_SIZE - boxSize) / 2;
          const boxY = (QR_SIZE - boxSize) / 2;

          // Fondo blanco redondeado detrás del logo para que no se mezcle
          // visualmente con los módulos del QR.
          ctx.fillStyle = "#ffffff";
          roundRect(ctx, boxX, boxY, boxSize, boxSize, boxSize * 0.18);
          ctx.fill();

          const scale = Math.min(logoSize / img.width, logoSize / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          ctx.drawImage(
            img,
            boxX + (boxSize - drawW) / 2,
            boxY + (boxSize - drawH) / 2,
            drawW,
            drawH
          );
        } catch {
          // Si el logo no carga (CORS, red, formato), el QR queda sin logo —
          // sigue siendo un QR válido y escaneable.
        }
      }

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
    const link = document.createElement("a");
    const safeName = shopName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "taller";
    link.download = `qr-${safeName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  if (!bookingUrl) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">{t.title}</h2>
        <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
      </div>
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-56 h-56 sm:w-64 sm:h-64">
          <canvas ref={canvasRef} width={QR_SIZE} height={QR_SIZE} className="w-full h-full rounded-lg border border-slate-100" />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg">
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
