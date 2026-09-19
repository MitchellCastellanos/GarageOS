"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { sendSupportMessage } from "@/actions/support";
import { Loader2, Send } from "lucide-react";

export interface SupportMessageRow {
  id: string;
  sender: "SHOP" | "SUPER_ADMIN" | "SYSTEM";
  content: string;
  createdAt: string;
}

export function SupportChat({ conversationId, initialMessages }: { conversationId: string | null; initialMessages: SupportMessageRow[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!conversationId) return;
    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) return;

    let unsub: (() => void) | undefined;
    let cancelled = false;

    import("pusher-js").then(({ default: Pusher }) => {
      if (cancelled) return;
      const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER! });
      const channel = pusher.subscribe(`platform-conversation-${conversationId}`);
      const handler = (message: SupportMessageRow) => {
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

    // Sin Pusher configurado no hay eco en tiempo real — se agrega optimista.
    // Con Pusher, el eco del propio mensaje llega por el canal y basta con eso.
    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) {
      setMessages((prev) => [...prev, { id: `local-${Date.now()}`, sender: "SHOP", content, createdAt: new Date().toISOString() }]);
    }

    startTransition(async () => {
      await sendSupportMessage(content);
    });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400 text-center mt-8">
            Escríbenos aquí — un miembro del equipo de GarageOS te va a responder.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === "SHOP" ? "justify-end" : "justify-start"}`}>
            {m.sender === "SYSTEM" ? (
              <p className="text-xs text-slate-400 w-full text-center">{m.content}</p>
            ) : (
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                  m.sender === "SHOP" ? "bg-amber-500 text-slate-950" : "bg-slate-100 text-slate-900"
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
          placeholder="Escribe un mensaje..."
          rows={1}
          className="flex-1 resize-none px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={pending || !draft.trim()}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-medium px-4 py-2 rounded-lg text-sm"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
