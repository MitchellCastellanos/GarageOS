// Pure helpers of the Sales inbound Email Worker (no Cloudflare or postal-mime imports, so they are unit-tested from the app's test suite).
export const MAX_RAW_BYTES = 10 * 1024 * 1024; // above this we do not parse; the message is forwarded to the fallback address instead
export const KEPT_HEADERS = ["in-reply-to", "references", "auto-submitted", "precedence", "list-unsubscribe", "x-auto-response-suppress", "return-path", "authentication-results", "received-spf"] as const;

export interface ParsedMail {
  from?: { address?: string; name?: string } | null; to?: { address?: string }[]; cc?: { address?: string }[];
  subject?: string; messageId?: string; date?: string; text?: string; html?: string;
  attachments?: { filename?: string | null; mimeType?: string; content?: ArrayBuffer | Uint8Array | string }[];
}

export interface Envelope { from: string; to: string; rawSize: number; headers: { get(name: string): string | null } }

const cut = (s: string | undefined | null, n: number) => (s ?? "").slice(0, n);
const addrs = (l: { address?: string }[] | undefined) => (l ?? []).map((a) => (a.address ?? "").trim()).filter(Boolean).slice(0, 50);

/** The JSON body POSTed to GarageOS. Caps mirror the server schema; attachments are reported as metadata only. */
export function buildPayload(env: Envelope, mail: ParsedMail) {
  const headers: Record<string, string> = {};
  for (const name of KEPT_HEADERS) { const v = env.headers.get(name); if (v) headers[name] = cut(v, 8000); }
  const from = mail.from?.address ? (mail.from.name ? `${mail.from.name.replace(/[<>"\r\n]/g, "")} <${mail.from.address}>` : mail.from.address) : env.from;
  return {
    envelopeFrom: env.from, envelopeTo: env.to,
    from, to: addrs(mail.to), cc: addrs(mail.cc),
    subject: cut(mail.subject, 998), messageId: mail.messageId ? cut(mail.messageId, 998) : null, date: mail.date ? cut(mail.date, 100) : null,
    text: mail.text ? cut(mail.text, 200_000) : null, html: mail.html ? cut(mail.html, 600_000) : null,
    headers, rawSize: env.rawSize,
    attachments: (mail.attachments ?? []).slice(0, 50).map((a) => ({ filename: a.filename ? cut(a.filename, 255) : null, contentType: cut(a.mimeType || "application/octet-stream", 200), size: typeof a.content === "string" ? a.content.length : (a.content?.byteLength ?? 0) })),
  };
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** HMAC-SHA256(secret, `${timestamp}.${body}`) → "v1=<hex>" (identical to src/domain/sales-comms/inbound-auth.ts signInbound). */
export async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `v1=${hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)))}`;
}
