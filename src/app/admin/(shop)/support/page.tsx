import { getMyConversation, markSupportConversationRead } from "@/actions/support";
import { SupportChat } from "@/components/support/SupportChat";
import { SupportCard } from "@/components/support/SupportCard";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { SUPPORT_DICT } from "@/lib/admin-locale/support";

export default async function SupportPage() {
  const [conversation, locale] = await Promise.all([getMyConversation(), getAdminLocale()]);
  await markSupportConversationRead();
  const t = SUPPORT_DICT[locale];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.page.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.page.subtitle}</p>
      </div>
      <SupportCard />
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
