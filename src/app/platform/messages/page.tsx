import { listPlatformConversations } from "@/actions/platform-messages";
import { MessagesInbox, type ConversationRow } from "@/components/admin/MessagesInbox";

export default async function PlatformMessagesPage() {
  const conversations = await listPlatformConversations();

  const rows: ConversationRow[] = conversations.map((c) => ({
    id: c.id,
    status: c.status,
    lastMessageAt: c.lastMessageAt.toISOString(),
    shop: c.shop,
    lastMessagePreview: c.messages[0]?.content ?? null,
  }));

  return <MessagesInbox conversations={rows} />;
}
