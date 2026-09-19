import { notFound } from "next/navigation";
import { getPlatformConversation } from "@/actions/platform-messages";
import { PlatformConversationThread } from "@/components/admin/PlatformConversationThread";

export default async function PlatformMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = await getPlatformConversation(id);
  if (!conversation) notFound();

  return (
    <PlatformConversationThread
      conversationId={conversation.id}
      shopName={conversation.shop.name}
      status={conversation.status}
      initialMessages={conversation.messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
