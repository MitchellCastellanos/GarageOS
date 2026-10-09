import "server-only";
// The ONLY place sales communications talk to Resend. Goes through the repo's gated client, so
// PROVIDER_SIDE_EFFECTS=enabled is required for every send, exactly like tenant email. Reads (domain list, received
// email fetch) are allowed without it.
import { getResendClient } from "@/lib/providers/resend";
import { isProviderDisabledError } from "@/lib/provider-policy";
import type { DomainFact } from "@/domain/sales-comms/sender-setup";

export class SendError extends Error {
  constructor(public readonly code: string, message: string, public readonly retryable: boolean, public readonly disabled = false) {
    super(message);
  }
}

const RETRYABLE = new Set(["rate_limit_exceeded", "internal_server_error", "application_error", "concurrent_idempotent_requests", "daily_quota_exceeded", "security_error"]);

export interface ProviderSendInput {
  from: string; to: string[]; cc?: string[]; bcc?: string[]; replyTo?: string; subject: string; html: string; text: string;
  headers: Record<string, string>; attachments?: { filename: string; content: Buffer; contentType?: string }[]; idempotencyKey: string;
}

/** Sends one email. `idempotencyKey` (the message id) makes a retry after a crash safe: the provider dedupes it. */
export async function providerSend(i: ProviderSendInput): Promise<{ providerMessageId: string }> {
  let client;
  try { client = getResendClient(); } catch (e) { throw new SendError("not_configured", e instanceof Error ? e.message : "not configured", false, true); }
  try {
    const { data, error } = await client.emails.send({
      from: i.from, to: i.to, cc: i.cc?.length ? i.cc : undefined, bcc: i.bcc?.length ? i.bcc : undefined, replyTo: i.replyTo,
      subject: i.subject, html: i.html, text: i.text, headers: i.headers,
      attachments: i.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    }, { idempotencyKey: i.idempotencyKey });
    if (error || !data?.id) {
      const name = (error as { name?: string } | null)?.name ?? "unknown";
      throw new SendError(name, error?.message ?? "Provider returned no id", RETRYABLE.has(name));
    }
    return { providerMessageId: data.id };
  } catch (e) {
    if (e instanceof SendError) throw e;
    if (isProviderDisabledError(e)) throw new SendError("provider_disabled", "External provider actions are disabled in this environment.", false, true);
    // Network / unexpected: the provider may or may not have accepted — a retry is safe thanks to the idempotency key.
    throw new SendError("network", e instanceof Error ? e.message : "network error", true);
  }
}

export type DomainLookup = { ok: true; domains: Map<string, DomainFact> } | { ok: false; error: string };

/** Live domain state from the provider (read-only). */
export async function lookupProviderDomains(): Promise<DomainLookup> {
  try {
    const client = getResendClient();
    const res = await client.domains.list();
    if (res.error) return { ok: false, error: res.error.message };
    const rows = (res.data as { data?: { name: string; status: string; capabilities?: { sending?: string; receiving?: string } }[] } | null)?.data ?? [];
    const map = new Map<string, DomainFact>();
    for (const d of rows) map.set(d.name.toLowerCase(), { found: true, status: d.status, sendingEnabled: d.capabilities?.sending !== "disabled", receivingEnabled: d.capabilities?.receiving === "enabled" });
    return { ok: true, domains: map };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "lookup failed" };
  }
}

export interface ReceivedEmail {
  id: string; from: string; to: string[]; cc: string[]; receivedFor: string[]; subject: string; text: string | null; html: string | null;
  messageId: string | null; headers: Record<string, string>; attachments: { id: string; filename: string | null; contentType: string; size: number }[];
}

/** Fetches the full body of an inbound email (the webhook payload only carries metadata). */
export async function fetchReceivedEmail(emailId: string): Promise<ReceivedEmail> {
  const client = getResendClient();
  const { data, error } = await client.emails.receiving.get(emailId);
  if (error || !data) throw new Error(`fetch received email failed: ${error?.message ?? "empty"}`);
  return {
    id: data.id, from: data.from, to: data.to ?? [], cc: data.cc ?? [], receivedFor: data.received_for ?? [], subject: data.subject ?? "",
    text: data.text, html: data.html, messageId: data.message_id ?? null, headers: data.headers ?? {},
    attachments: (data.attachments ?? []).map((a) => ({ id: a.id, filename: a.filename, contentType: a.content_type, size: a.size })),
  };
}

export async function fetchReceivedAttachment(emailId: string, attachmentId: string): Promise<Buffer> {
  const client = getResendClient();
  const { data, error } = await client.emails.receiving.attachments.get({ emailId, id: attachmentId });
  if (error || !data) throw new Error(`fetch attachment failed: ${error?.message ?? "empty"}`);
  if (new URL(data.download_url).protocol !== "https:") throw new Error("attachment download refused: not https");
  const res = await fetch(data.download_url);
  if (!res.ok) throw new Error(`attachment download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
