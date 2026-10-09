import "server-only";
import { getPusherForPublish } from "@/lib/providers/pusher";
import { salesInboxChannel } from "@/lib/platform/pusher-channels";

export type InboxSignalType = "inbound" | "sent" | "status" | "assigned" | "meeting";

/**
 * Realtime SIGNAL only (thread id + kind) — never message content. Receivers refetch through an authenticated server
 * action, which re-checks ownership. Best effort: a Pusher outage never affects mail delivery or the database.
 */
export async function publishInboxSignal(userId: string | null | undefined, signal: { threadId?: string; type: InboxSignalType }): Promise<void> {
  if (!userId) return;
  const pusher = getPusherForPublish();
  if (!pusher) return;
  try { await pusher.trigger(salesInboxChannel(userId), "inbox-updated", { threadId: signal.threadId ?? null, type: signal.type, at: Date.now() }); }
  catch (e) { console.error("[sales-comms/realtime] publish failed:", e instanceof Error ? e.message : e); }
}
