import { ADMIN, adminPath } from "@/lib/routes";
import Link from "next/link";
import { Inbox as InboxIcon, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { listThreads, getInboxSenderOptionsAction } from "@/actions/inbox";
import { formatClientName } from "@/lib/client-name";
import { ComposeButton } from "@/components/inbox/ComposeButton";
import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";

interface PageProps { searchParams: Promise<{ status?: string }>; }
const TABS = [{ value: "OPEN", label: "Abiertas" }, { value: "ARCHIVED", label: "Archivadas" }] as const;

function formatRelative(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr} h`;
  return `hace ${Math.floor(diffHr / 24)} d`;
}

export default async function InboxPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const activeTab = status === "ARCHIVED" ? "ARCHIVED" : "OPEN";
  const [threads, shop, senderOptions] = await Promise.all([
    listThreads(activeTab),
    getShopId().then((shopId) => db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { name: true } })),
    getInboxSenderOptionsAction(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Bandeja de entrada</h1><p className="text-slate-500 text-sm mt-1">{threads.length} conversación{threads.length !== 1 ? "es" : ""}</p></div>
        <ComposeButton shopName={shop.name} senderOptions={senderOptions.options} defaultSenderId={senderOptions.defaultId} />
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {TABS.map((tab) => <Link key={tab.value} href={tab.value === "OPEN" ? ADMIN.inbox : `${ADMIN.inbox}?status=${tab.value}`} className={["px-3 py-1.5 rounded-md text-sm font-medium transition-colors", activeTab === tab.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"].join(" ")}>{tab.label}</Link>)}
      </div>

      {threads.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><InboxIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500 font-medium">{activeTab === "OPEN" ? "No hay conversaciones abiertas" : "No hay conversaciones archivadas"}</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden"><div className="divide-y divide-slate-100">
          {threads.map((thread) => {
            const last = thread.messages[0];
            return <Link key={thread.id} href={adminPath(`/inbox/${thread.id}`)} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
              <div className="flex-shrink-0">{last?.direction === "INBOUND" ? <ArrowDownLeft className="w-4 h-4 text-emerald-600" /> : <ArrowUpRight className="w-4 h-4 text-slate-400" />}</div>
              <div className="flex-1 min-w-0"><p className="font-medium text-slate-900 text-sm truncate">{thread.client ? formatClientName(thread.client) : thread.subject || "Sin asunto"}</p><p className="text-slate-500 text-sm truncate">{last?.subject || thread.subject || "Sin asunto"}</p></div>
              {last && <span className="flex-shrink-0 text-xs text-slate-400">{formatRelative(thread.lastMessageAt)}</span>}
            </Link>;
          })}
        </div></div>
      )}
    </div>
  );
}
