"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, MessageSquare, Phone } from "lucide-react";
import { PLATFORM } from "@/lib/routes";

export interface PlatformPendingCounts {
  waitingMessages: number;
  pendingSmsRequests: number;
}

/**
 * Campana visible en todo /platform (no solo en /platform/messages o la
 * lista de talleres) — sin ella, un super admin solo se entera de una
 * solicitud de número SMS si entra a Mensajes, o de una conversación
 * esperando respuesta si entra a esa página. Cuenta, no lista: cada categoría
 * ya tiene su propia pantalla con el detalle. El conteo en vivo lo maneja
 * PlatformChrome (una sola suscripción de Pusher para toda la página).
 */
export function PlatformNotificationBell({ counts, onOpen }: { counts: PlatformPendingCounts; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const total = counts.waitingMessages + counts.pendingSmsRequests;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) onOpen?.(); // sin Pusher configurado (o si se perdió un evento), refresca al abrir
  }

  return (
    <div className="relative flex-shrink-0" ref={menuRef}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Pendientes"
        aria-expanded={open}
        className="relative p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {total > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg border border-slate-200 shadow-lg z-30 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-900">Pendientes</span>
          </div>
          {total === 0 ? (
            <p className="px-3 py-6 text-sm text-slate-400 text-center">Nada pendiente por ahora.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {counts.waitingMessages > 0 && (
                <Link
                  href={PLATFORM.messages}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50"
                >
                  <MessageSquare className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm text-slate-700">
                    {counts.waitingMessages} conversación{counts.waitingMessages === 1 ? "" : "es"} esperando respuesta
                  </span>
                </Link>
              )}
              {counts.pendingSmsRequests > 0 && (
                <Link
                  href={PLATFORM.home}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50"
                >
                  <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm text-slate-700">
                    {counts.pendingSmsRequests} taller{counts.pendingSmsRequests === 1 ? "" : "es"} pidiendo número SMS
                  </span>
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
