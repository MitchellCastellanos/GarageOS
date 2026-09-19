"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { sendPlatformReply, closePlatformConversation } from "@/actions/platform-messages";
import { PLATFORM } from "@/lib/routes";
import { ArrowLeft, Loader2, Send, X } from "lucide-react";

export interface PlatformMessageRow {
  id: string;
  sender: "SHOP" | "SUPER_ADMIN" | "SYSTEM";
  content: string;
  createdAt: string;
}

export function PlatformConversationThread({
  conversationId,
  shopName,
  status,
  initialMessages,
}: {
  conversationId: string;
  shopName: string;
  status: "WAITING_HUMAN" | "LIVE" | "CLOSED";
  initialMessages: PlatformMessageRow[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;

    import("pusher-js").then(({ default: Pusher }) => {
      if (cancelled) return;
      const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER! });
      const channel = pusher.subscribe(`platform-conversation-${conversationId}`);
      const handler = (message: PlatformMessageRow) => {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      };
      channel.bind("message", handler);
      unsub = () => {
        channel.unbind("message", handler);
        pusher.unsubscribe(`platform-conversation-${conversationId}`);
        pusher.disconnect();
      };
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [conversationId]);

  function handleSend() {
    const content = draft.trim();
    if (!content) return;
    setDraft("");

    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) {
      setMessages((prev) => [...prev, { id: `local-${Date.now()}`, sender: "SUPER_ADMIN", content, createdAt: new Date().toISOString() }]);
    }

    startTransition(async () => {
      const result = await sendPlatformReply(conversationId, content);
      if (result && "error" in result) toast.error(result.error);
    });
  }

  function handleClose() {
    startTransition(async () => {
      await closePlatformConversation(conversationId);
      toast.success("Conversación cerrada");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href={PLATFORM.messages} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="w-4 h-4" />
          Mensajes
        </Link>
        {status !== "CLOSED" && (
          <button
            type="button"
            onClick={handleClose}
            disabled={pending}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-600 border border-slate-200 rounded-lg px-3 py-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Cerrar conversación
          </button>
        )}
      </div>

      <h1 className="text-xl font-bold text-slate-900">{shopName}</h1>

      <div className="flex flex-col h-[calc(100dvh-300px)] min-h-[360px] bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender === "SUPER_ADMIN" ? "justify-end" : "justify-start"}`}>
              {m.sender === "SYSTEM" ? (
                <p className="text-xs text-slate-400 w-full text-center">{m.content}</p>
              ) : (
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                    m.sender === "SUPER_ADMIN" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
                  }`}
                >
                  {m.content}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-slate-200 p-3 flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Responder..."
            rows={1}
            className="flex-1 resize-none px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={pending || !draft.trim()}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-sm"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
