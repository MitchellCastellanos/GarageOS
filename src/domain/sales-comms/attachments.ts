// Attachment validation — pure. Allowlist by MIME + extension + magic bytes; filenames sanitized; hard size caps.
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
export const MAX_TOTAL_ATTACHMENT_BYTES = 12 * 1024 * 1024;

const TYPES: Record<string, { ext: string[]; magic: (b: Uint8Array) => boolean }> = {
  "application/pdf": { ext: ["pdf"], magic: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
  "image/png": { ext: ["png"], magic: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) },
  "image/jpeg": { ext: ["jpg", "jpeg"], magic: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  "image/webp": { ext: ["webp"], magic: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
};

function startsWith(b: Uint8Array, sig: number[]) { return sig.every((v, i) => b[i] === v); }

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").replace(/^\.+/, "").trim();
  return (cleaned || "file").slice(0, 120);
}

export type AttachmentCheck = { ok: true; filename: string; mimeType: string } | { ok: false; code: "TOO_LARGE" | "EMPTY" | "TYPE_NOT_ALLOWED" | "CONTENT_MISMATCH" };

export function validateAttachment(file: { filename: string; mimeType: string; bytes: Uint8Array }): AttachmentCheck {
  if (file.bytes.length === 0) return { ok: false, code: "EMPTY" };
  if (file.bytes.length > MAX_ATTACHMENT_BYTES) return { ok: false, code: "TOO_LARGE" };
  const mime = file.mimeType.toLowerCase();
  const rule = TYPES[mime];
  const filename = sanitizeFilename(file.filename);
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!rule || !rule.ext.includes(ext)) return { ok: false, code: "TYPE_NOT_ALLOWED" };
  if (!rule.magic(file.bytes)) return { ok: false, code: "CONTENT_MISMATCH" };
  return { ok: true, filename, mimeType: mime };
}
