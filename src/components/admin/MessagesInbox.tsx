"use client";

import Link from "next/link";
import { PLATFORM } from "@/lib/routes";
import { MessageCircle } from "lucide-react";

export interface ConversationRow {
  id: string;
  status: "WAITING_HUMAN" | "LIVE" | "CLOSED";
  lastMessageAt: string;
  shop: { id: string; name: string };
  lastMessagePreview: string | null;
}

const STATUS_LABEL: Record<ConversationRow["status"], string> = {
  WAITING_HUMAN: "Esperando respuesta",
  LIVE: "En curso",
  CLOSED: "Cerrada",
};

const STATUS_COLOR: Record<ConversationRow["status"], string> = {
  WAITING_HUMAN: "bg-red-100 text-red-700",
  LIVE: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-slate-100 text-slate-500",
};

export function MessagesInbox({ conversations }: { conversations: ConversationRow[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mensajes</h1>
        <p className="text-slate-500 text-sm mt-1">Soporte a talleres — contestado desde aquí.</p>
      </div>

      {conversations.length === 0 ? (
        <p className="text-sm text-slate-500">No hay conversaciones todavía.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl divide-y">
          {conversations.map((c) => (
            <Link
              key={c.id}
              href={PLATFORM.message(c.id)}
              className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-4 hover:bg-slate-50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-4 h-4 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{c.shop.name}</p>
                  <p className="text-sm text-slate-500 truncate max-w-[240px] sm:max-w-md">{c.lastMessagePreview ?? "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-[3.25rem] sm:ml-0">
                <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${STATUS_COLOR[c.status]}`}>
                  {STATUS_LABEL[c.status]}
                </span>
                <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(c.lastMessageAt).toLocaleDateString("es-CA")}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
