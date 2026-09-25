import { BOOKING_IMAGE_MIME_TYPES, MAX_BOOKING_IMAGE_BYTES } from "@/lib/booking-page";

/** Lado mayor al que se reduce en el navegador una foto demasiado pesada (el servidor vuelve a optimizar). */
const CLIENT_MAX_DIMENSION = 2400;

/**
 * Las fotos de teléfono suelen pesar más de 4 MB (límite del request en
 * Vercel). En vez de rechazarlas, las reducimos en el navegador a JPEG
 * antes de subir. Si la foto ya es liviana se sube tal cual.
 */
export async function prepareBookingImage(file: File): Promise<File> {
  if (file.size <= MAX_BOOKING_IMAGE_BYTES && BOOKING_IMAGE_MIME_TYPES.includes(file.type)) return file;
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, CLIENT_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // Formato que el navegador no puede decodificar (p.ej. HEIC en Chrome) —
    // se manda tal cual y el servidor responde con el error de tipo/tamaño.
    return file;
  }
}
