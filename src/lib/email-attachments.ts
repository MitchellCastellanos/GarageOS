const MAX_EMAIL_EXTRA_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type EmailAttachment = { filename: string; content: Buffer };

export function maxUserEmailAttachments(reservedCount: number): number {
  return Math.max(0, MAX_EMAIL_EXTRA_ATTACHMENTS - reservedCount);
}

export async function parseEmailAttachments(
  formData?: FormData,
  options?: { maxUserFiles?: number }
) {
  const maxUserFiles = options?.maxUserFiles ?? MAX_EMAIL_EXTRA_ATTACHMENTS;

  if (!formData) return { attachments: [] as EmailAttachment[] };

  const files = formData
    .getAll("attachments")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length > maxUserFiles) {
    return {
      error:
        maxUserFiles === 0
          ? "No puedes agregar más archivos: los comprobantes de pago ya ocupan el límite del correo"
          : `Máximo ${maxUserFiles} archivo(s) extra en este envío`,
    };
  }

  const attachments: EmailAttachment[] = [];

  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return { error: `${file.name} supera el límite de 5 MB` };
    }
    const type = file.type || "application/octet-stream";
    if (!ALLOWED_ATTACHMENT_TYPES.has(type)) {
      return { error: `${file.name}: solo PDF o imágenes (JPG, PNG, WebP)` };
    }
    attachments.push({
      filename: file.name,
      content: Buffer.from(await file.arrayBuffer()),
    });
  }

  return { attachments };
}

/** Combina adjuntos del usuario y comprobantes; valida el tope global. */
export function mergeEmailAttachments(
  userAttachments: EmailAttachment[],
  extra: EmailAttachment[]
): { attachments: EmailAttachment[] } | { error: string } {
  const combined = [...userAttachments, ...extra];
  if (combined.length > MAX_EMAIL_EXTRA_ATTACHMENTS) {
    return {
      error: `Demasiados adjuntos (${combined.length}). Máximo ${MAX_EMAIL_EXTRA_ATTACHMENTS} además del PDF de la factura.`,
    };
  }
  return { attachments: combined };
}
