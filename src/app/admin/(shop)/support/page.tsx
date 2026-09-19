import { getMyConversation, markSupportConversationRead } from "@/actions/support";
import { SupportChat } from "@/components/support/SupportChat";

export default async function SupportPage() {
  const conversation = await getMyConversation();
  await markSupportConversationRead();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Ayuda</h1>
        <p className="text-slate-500 text-sm mt-1">Escríbele directo al equipo de GarageOS — te respondemos por aquí.</p>
      </div>
      <SupportChat
        conversationId={conversation?.id ?? null}
        initialMessages={
          conversation?.messages.map((m) => ({
            id: m.id,
            sender: m.sender,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
          })) ?? []
        }
      />
    </div>
  );
}
