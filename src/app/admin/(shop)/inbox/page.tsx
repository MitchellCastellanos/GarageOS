import { ADMIN, adminPath } from "@/lib/routes";
import Link from "next/link";
import { Inbox as InboxIcon, ArrowDownLeft, ArrowUpRight, MessageSquare, Mail } from "lucide-react";
import { listThreads, getInboxSenderOptionsAction, getSmsComposeState } from "@/actions/inbox";
import { formatClientName } from "@/lib/client-name";
import { ComposeButton } from "@/components/inbox/ComposeButton";
import { ComposeSmsButton } from "@/components/inbox/ComposeSmsButton";
import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { INBOX_DICT, type InboxDictionary } from "@/lib/admin-locale/inbox";

interface PageProps { searchParams: Promise<{ status?: string }>; }

function formatRelative(date: Date, t: InboxDictionary["list"]["relative"]): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return t.now;
  if (diffMin < 60) return t.minutesAgo(diffMin);
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t.hoursAgo(diffHr);
  return t.daysAgo(Math.floor(diffHr / 24));
}

export default async function InboxPage({ searchParams }: PageProps) {
  const locale = await getAdminLocale();
  const t = INBOX_DICT[locale];
  const { status } = await searchParams;
  const activeTab = status === "ARCHIVED" ? "ARCHIVED" : "OPEN";
  const TABS = [{ value: "OPEN", label: t.list.tabs.open }, { value: "ARCHIVED", label: t.list.tabs.archived }] as const;
  const [threads, shop, senderOptions, smsState] = await Promise.all([
    listThreads(activeTab),
    getShopId().then((shopId) => db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { name: true } })),
    getInboxSenderOptionsAction(),
    getSmsComposeState(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">{t.list.pageTitle}</h1><p className="text-slate-500 text-sm mt-1">{t.list.countLabel(threads.length)}</p></div>
        <div className="flex flex-wrap gap-2">
          {smsState.dedicated && <ComposeSmsButton />}
          <ComposeButton shopName={shop.name} senderOptions={senderOptions.options} defaultSenderId={senderOptions.defaultId} />
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {TABS.map((tab) => <Link key={tab.value} href={tab.value === "OPEN" ? ADMIN.inbox : `${ADMIN.inbox}?status=${tab.value}`} className={["px-3 py-1.5 rounded-md text-sm font-medium transition-colors", activeTab === tab.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"].join(" ")}>{tab.label}</Link>)}
      </div>

      {threads.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><InboxIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500 font-medium">{activeTab === "OPEN" ? t.list.emptyOpen : t.list.emptyArchived}</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden"><div className="divide-y divide-slate-100">
          {threads.map((thread) => {
            const last = thread.messages[0];
            return <Link key={thread.id} href={adminPath(`/inbox/${thread.id}`)} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
              <div className="flex-shrink-0">{last?.direction === "INBOUND" ? <ArrowDownLeft className="w-4 h-4 text-emerald-600" /> : <ArrowUpRight className="w-4 h-4 text-slate-400" />}</div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate flex items-center gap-1.5 ${thread.unread ? "font-bold text-slate-900" : "font-medium text-slate-900"}`}>
                  {thread.channel === "SMS" ? <MessageSquare className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" aria-label={t.sms.channelSms} /> : <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" aria-label={t.sms.channelEmail} />}
                  <span className="truncate">{thread.client ? formatClientName(thread.client) : thread.channel === "SMS" ? thread.contactAddress : thread.subject || t.list.noSubject}</span>
                </p>
                <p className="text-slate-500 text-sm truncate">{thread.channel === "SMS" ? last?.textBody : last?.subject || thread.subject || t.list.noSubject}</p>
              </div>
              {thread.unread && <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500" aria-label={t.sms.unread} />}
              {last && <span className="flex-shrink-0 text-xs text-slate-400">{formatRelative(thread.lastMessageAt, t.list.relative)}</span>}
            </Link>;
          })}
        </div></div>
      )}
    </div>
  );
}
