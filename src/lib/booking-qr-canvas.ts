import QRCode from "qrcode";

/** Dibujo del QR de reservas con el logo del taller al centro. Solo navegador (usa canvas e Image). */
export const QR_SIZE = 640;

// Máximo razonable de espacio para el logo sin arriesgar la legibilidad: con
// corrección de errores 'H' (~30%) el escáner sigue funcionando con esta
// proporción de módulos tapados en el centro.
const LOGO_RATIO = 0.22;
const LOGO_PADDING_RATIO = 0.035;

function loadImage(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo load failed"));
    img.src = src;
  });
}

/**
 * Intenta cargar el logo con CORS (necesario para poder exportar el canvas
 * luego con toDataURL); si el host del logo no manda los headers de CORS,
 * reintenta sin — el logo se sigue dibujando bien en pantalla, solo que la
 * descarga fallará más adelante si el canvas queda "tainted".
 */
async function loadLogoWithFallback(src: string): Promise<HTMLImageElement> {
  try {
    return await loadImage(src, true);
  } catch {
    return loadImage(src, false);
  }
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

/**
 * Pinta el QR en `canvas` (corrección de errores 'H') y, si hay logo, lo centra sobre un fondo blanco.
 * Si el logo no carga el QR queda sin logo, pero sigue siendo válido y escaneable.
 */
export async function drawBookingQr(
  canvas: HTMLCanvasElement,
  bookingUrl: string,
  logoUrl: string | null,
  isCancelled: () => boolean = () => false
): Promise<void> {
  await QRCode.toCanvas(canvas, bookingUrl, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: QR_SIZE,
    color: { dark: "#131417", light: "#ffffff" },
  });

  // La librería fija canvas.style.width/height en px (ver
  // node_modules/qrcode/lib/renderer/canvas.js) — eso le gana a nuestras
  // clases de Tailwind y hace que el QR se salga de su contenedor.
  // Lo limpiamos para que el tamaño lo controle el CSS de afuera.
  canvas.style.removeProperty("width");
  canvas.style.removeProperty("height");

  if (!logoUrl || isCancelled()) return;
  try {
    const img = await loadLogoWithFallback(logoUrl);
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    if (!naturalW || !naturalH) throw new Error("logo has no intrinsic size");

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

    const scale = Math.min(logoSize / naturalW, logoSize / naturalH);
    const drawW = naturalW * scale;
    const drawH = naturalH * scale;
    ctx.drawImage(img, boxX + (boxSize - drawW) / 2, boxY + (boxSize - drawH) / 2, drawW, drawH);
  } catch (err) {
    console.warn("[BookingQrCode] no se pudo dibujar el logo:", err);
  }
}
