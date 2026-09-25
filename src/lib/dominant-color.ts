/**
 * Extrae el color dominante de una imagen (el logo) para pre-llenar el color
 * de marca en el asistente de arranque — el taller puede seguir ajustándolo
 * a mano. Corre en el navegador (canvas), no en el servidor.
 *
 * Ignora píxeles casi blancos/negros/transparentes (fondos comunes de logo)
 * para no terminar con blanco o negro como "color de marca".
 */
export async function extractDominantColor(imageUrl: string): Promise<string | null> {
  try {
    const img = await loadImage(imageUrl);
    const size = 48;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);

    const { data } = ctx.getImageData(0, 0, size, size);
    const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();

    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 200) continue;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const isNearWhite = min > 235;
      const isNearBlack = max < 25;
      const isLowSaturation = max - min < 12 && (max < 60 || max > 210);
      if (isNearWhite || isNearBlack || isLowSaturation) continue;

      // Cuantiza a bins de 16 para agrupar tonos parecidos.
      const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
    }

    let best: { count: number; r: number; g: number; b: number } | null = null;
    for (const bucket of buckets.values()) {
      if (!best || bucket.count > best.count) best = bucket;
    }
    if (!best) return null;

    return `#${[best.r, best.g, best.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}
