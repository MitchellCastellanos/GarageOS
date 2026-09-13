// Keep uploads below Vercel's request limit, including multipart overhead.
export const MAX_LOGO_BYTES = 4 * 1024 * 1024;
export const LOGO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];

export function validateLogo(file: { size: number; type: string }): "empty" | "tooLarge" | "invalidType" | null {
  if (file.size === 0) return "empty";
  if (file.size > MAX_LOGO_BYTES) return "tooLarge";
  if (!LOGO_MIME_TYPES.includes(file.type)) return "invalidType";
  return null;
}
