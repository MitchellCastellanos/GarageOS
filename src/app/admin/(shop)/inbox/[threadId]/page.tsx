import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Paperclip } from "lucide-react";
import { getThreadDetail, getInboxSenderOptionsAction, getSmsComposeState, markThreadReadAction } from "@/actions/inbox";
import { formatClientName } from "@/lib/client-name";
import { formatDate } from "@/lib/utils";
import { signedUrlForCommunicationAttachment } from "@/lib/storage";
import { ReplyBox } from "@/components/inbox/ReplyBox";
import { SmsReplyBox } from "@/components/inbox/SmsReplyBox";
import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { INBOX_DICT } from "@/lib/admin-locale/inbox";

interface PageProps { params: Promise<{ threadId: string }>; }
type ThreadDetail = NonNullable<Awaited<ReturnType<typeof getThreadDetail>>>;
type ThreadMessage = ThreadDetail["thread"]["messages"][number];

async function MessageRow({ message, youTo }: { message: ThreadMessage; youTo: (to: string) => string }) {
  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-2">
        {message.direction === "INBOUND" ? <ArrowDownLeft className="w-4 h-4 text-emerald-600" /> : <ArrowUpRight className="w-4 h-4 text-slate-400" />}
        <span className="text-sm font-medium text-slate-900">{message.direction === "INBOUND" ? message.from : youTo(message.to.join(", "))}</span>
        <span className="text-xs text-slate-400 ml-auto">{formatDate(message.createdAt)}</span>
      </div>
      {message.subject && <p className="text-sm font-medium text-slate-700 mb-1">{message.subject}</p>}
      <div className="text-sm text-slate-700 whitespace-pre-wrap">{message.textBody}</div>
      {message.attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {await Promise.all(message.attachments.map(async (att) => {
            let href = "#";
            try { href = await signedUrlForCommunicationAttachment(att.storageKey); } catch {}
            return <a key={att.id} href={href} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline border border-slate-200 rounded-lg px-2 py-1"><Paperclip className="w-3 h-3" />{att.filename}</a>;
          }))}
        </div>
      )}
      {message.channel === "SMS" && message.segments ? <span className="inline-flex mt-2 mr-2 text-[11px] text-slate-400">SMS · {message.segments} seg.</span> : null}
      <span className={`inline-flex mt-2 px-2 py-0.5 rounded-full text-[11px] font-medium ${message.status === "FAILED" ? "bg-red-100 text-red-700" : message.status === "SENT" || message.status === "DELIVERED" || message.status === "RECEIVED" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{message.status}</span>
    </div>
  );
}

export default async function ThreadDetailPage({ params }: PageProps) {
  const locale = await getAdminLocale();
  const t = INBOX_DICT[locale];
  const { threadId } = await params;
  const [detail, shop, senderOptions] = await Promise.all([
    getThreadDetail(threadId),
    getShopId().then((shopId) => db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { name: true } })),
    getInboxSenderOptionsAction(),
  ]);
  if (!detail) notFound();

  const { thread, clientHistory } = detail;
  // Abrir el hilo lo marca como leído (apaga el punto del sidebar y de la lista).
  if (thread.lastInboundAt && (!thread.readAt || thread.lastInboundAt > thread.readAt)) {
    await markThreadReadAction(thread.id);
  }
  const smsState = thread.channel === "SMS" ? await getSmsComposeState(thread.contactAddress) : null;
  const lastInbound = [...thread.messages].reverse().find((m) => m.direction === "INBOUND");
  const lastOutbound = [...thread.messages].reverse().find((m) => m.direction === "OUTBOUND");
  const defaultTo = lastInbound?.from ?? thread.client?.email ?? lastOutbound?.to[0] ?? "";
  const defaultSubject = thread.subject ? `Re: ${thread.subject}` : "Re:";

  return (
    <div className="max-w-3xl space-y-6">
      <div><h1 className="text-xl font-bold text-slate-900">{thread.client ? formatClientName(thread.client) : thread.channel === "SMS" ? thread.contactAddress : thread.subject || t.thread.fallbackTitle}</h1><p className="text-slate-500 text-sm mt-1">{thread.channel === "SMS" ? `${t.sms.channelSms} · ${thread.contactAddress ?? ""}` : thread.subject || t.thread.noSubject}</p></div>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">{thread.messages.map((message) => <MessageRow key={message.id} message={message} youTo={t.thread.youTo} />)}</div>
      {clientHistory.length > 0 && <div className="bg-white rounded-xl border border-slate-200 p-5"><h3 className="text-sm font-semibold text-slate-900 mb-3">{t.thread.clientHistoryTitle}</h3><ul className="space-y-2">{clientHistory.map((m) => <li key={m.id} className="text-xs text-slate-500 flex items-center justify-between"><span>{m.purpose ?? m.channel} — {m.subject ?? m.status}</span><span>{formatDate(m.createdAt)}</span></li>)}</ul></div>}
      {smsState ? (
        <SmsReplyBox threadId={thread.id} dedicated={smsState.dedicated} optedOut={smsState.optedOut} />
      ) : (
        <ReplyBox
          threadId={thread.id}
          defaultTo={defaultTo}
          defaultSubject={defaultSubject}
          shopName={shop.name}
          senderOptions={senderOptions.options}
          defaultSenderId={senderOptions.defaultId}
        />
      )}
    </div>
  );
}
