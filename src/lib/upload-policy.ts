// Upload allow-lists (Block 15). Files land in a PUBLIC storage bucket, so the browser-supplied MIME type
// is the difference between "a photo" and "an HTML/SVG page hosted on our storage domain". Only inert
// formats are accepted; anything else is refused before it reaches storage.

export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

export const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export function isAllowedPhotoType(mime: string | null | undefined): boolean {
  return (PHOTO_MIME_TYPES as readonly string[]).includes((mime ?? "").toLowerCase());
}

export function isAllowedDocumentType(mime: string | null | undefined): boolean {
  return (DOCUMENT_MIME_TYPES as readonly string[]).includes((mime ?? "").toLowerCase());
}
