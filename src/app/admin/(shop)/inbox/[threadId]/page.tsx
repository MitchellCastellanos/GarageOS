import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Paperclip } from "lucide-react";
import { getThreadDetail } from "@/actions/inbox";
import { formatClientName } from "@/lib/client-name";
import { formatDate } from "@/lib/utils";
import { signedUrlForCommunicationAttachment } from "@/lib/storage";
import { ReplyBox } from "@/components/inbox/ReplyBox";
import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";

interface PageProps { params: Promise<{ threadId: string }>; }
type ThreadDetail = NonNullable<Awaited<ReturnType<typeof getThreadDetail>>>;
type ThreadMessage = ThreadDetail["thread"]["messages"][number];

async function MessageRow({ message }: { message: ThreadMessage }) {
  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-2">
        {message.direction === "INBOUND" ? <ArrowDownLeft className="w-4 h-4 text-emerald-600" /> : <ArrowUpRight className="w-4 h-4 text-slate-400" />}
        <span className="text-sm font-medium text-slate-900">{message.direction === "INBOUND" ? message.from : `Tú → ${message.to.join(", ")}`}</span>
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
      <span className={`inline-flex mt-2 px-2 py-0.5 rounded-full text-[11px] font-medium ${message.status === "FAILED" ? "bg-red-100 text-red-700" : message.status === "SENT" || message.status === "DELIVERED" || message.status === "RECEIVED" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{message.status}</span>
    </div>
  );
}

export default async function ThreadDetailPage({ params }: PageProps) {
  const { threadId } = await params;
  const [detail, shop] = await Promise.all([
    getThreadDetail(threadId),
    getShopId().then((shopId) => db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { name: true } })),
  ]);
  if (!detail) notFound();

  const { thread, clientHistory } = detail;
  const lastInbound = [...thread.messages].reverse().find((m) => m.direction === "INBOUND");
  const lastOutbound = [...thread.messages].reverse().find((m) => m.direction === "OUTBOUND");
  const defaultTo = lastInbound?.from ?? thread.client?.email ?? lastOutbound?.to[0] ?? "";
  const defaultSubject = thread.subject ? `Re: ${thread.subject}` : "Re:";

  return (
    <div className="max-w-3xl space-y-6">
      <div><h1 className="text-xl font-bold text-slate-900">{thread.client ? formatClientName(thread.client) : thread.subject || "Conversación"}</h1><p className="text-slate-500 text-sm mt-1">{thread.subject || "Sin asunto"}</p></div>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">{thread.messages.map((message) => <MessageRow key={message.id} message={message} />)}</div>
      {clientHistory.length > 0 && <div className="bg-white rounded-xl border border-slate-200 p-5"><h3 className="text-sm font-semibold text-slate-900 mb-3">Historial automatizado del cliente</h3><ul className="space-y-2">{clientHistory.map((m) => <li key={m.id} className="text-xs text-slate-500 flex items-center justify-between"><span>{m.purpose ?? m.channel} — {m.subject ?? m.status}</span><span>{formatDate(m.createdAt)}</span></li>)}</ul></div>}
      <ReplyBox threadId={thread.id} defaultTo={defaultTo} defaultSubject={defaultSubject} shopName={shop.name} />
    </div>
  );
}
