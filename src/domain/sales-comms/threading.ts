// Inbound → thread matching — pure. The DB layer gathers candidates; this decides. Order of trust:
//  1. the reply key in the recipient address (plus-address we generated),
//  2. RFC In-Reply-To / References against Message-IDs we stored,
//  3. LAST resort: same identity + same counterparty + same normalized subject, recently active.
// A subject-only match is never allowed to cross identities or counterparties.
import { normalizeSubject } from "./email";

export interface ThreadCandidate {
  id: string; identityId: string; counterpartyEmail: string | null; subject: string; lastMessageAt: Date; status: "OPEN" | "DONE" | "SPAM";
}

export type ThreadMatch =
  | { kind: "reply_key"; threadId: string }
  | { kind: "message_id"; threadId: string }
  | { kind: "subject"; threadId: string }
  | { kind: "new" };

export const SUBJECT_MATCH_WINDOW_DAYS = 30;

export function matchThread(args: {
  replyKeyThreadId: string | null;
  referencedMessageThreadIds: string[];
  identityId: string | null;
  fromEmail: string;
  subject: string;
  candidates: ThreadCandidate[];
  now: Date;
}): ThreadMatch {
  if (args.replyKeyThreadId) return { kind: "reply_key", threadId: args.replyKeyThreadId };
  if (args.referencedMessageThreadIds.length > 0) return { kind: "message_id", threadId: args.referencedMessageThreadIds[0] };
  if (args.identityId) {
    const want = normalizeSubject(args.subject);
    const cutoff = args.now.getTime() - SUBJECT_MATCH_WINDOW_DAYS * 86_400_000;
    const hit = args.candidates
      .filter((c) => c.identityId === args.identityId && c.status !== "SPAM" && c.counterpartyEmail === args.fromEmail.toLowerCase()
        && c.lastMessageAt.getTime() >= cutoff && want !== "" && normalizeSubject(c.subject) === want)
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())[0];
    if (hit) return { kind: "subject", threadId: hit.id };
  }
  return { kind: "new" };
}
