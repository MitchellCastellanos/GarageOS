"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addPlatformNote } from "@/actions/platform";
import { Loader2 } from "lucide-react";

export interface PlatformNoteRow {
  id: string;
  body: string;
  authorUserId: string;
  createdAt: Date;
}

export interface PlatformAuditLogRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  actorUserId: string;
  createdAt: Date;
}

const ACTION_LABELS: Record<string, string> = {
  SHOP_CREATED: "Taller creado",
  OWNER_CREATED: "Dueño creado",
  USER_CREATED: "Usuario creado",
  USER_DELETED: "Usuario eliminado",
  PASSWORD_RESET: "Contraseña restablecida",
  PLAN_CHANGED: "Plan cambiado",
  SUBSCRIPTION_CANCELED: "Suscripción cancelada",
  BILLING_CONTACT_UPDATED: "Contacto de facturación actualizado",
  COMMUNICATIONS_SUSPENDED: "Comunicaciones suspendidas",
  COMMUNICATIONS_RESUMED: "Comunicaciones reactivadas",
  NOTE_ADDED: "Nota agregada",
  IMPERSONATION_STARTED: "Impersonación iniciada",
  IMPERSONATION_ENDED: "Impersonación terminada",
};

function fmt(d: Date) {
  return d.toLocaleString("es-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ShopActivityTab({
  shopId,
  notes,
  auditLog,
  actorNames,
}: {
  shopId: string;
  notes: PlatformNoteRow[];
  auditLog: PlatformAuditLogRow[];
  actorNames: Record<string, string>;
}) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function handleAddNote() {
    startTransition(async () => {
      const result = await addPlatformNote(shopId, body);
      if (result?.success) {
        toast.success("Nota agregada");
        setBody("");
      } else toast.error(result?.error ?? "Error");
    });
  }

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <div>
        <h2 className="font-semibold text-slate-900 mb-3">Notas internas</h2>
        <p className="text-xs text-slate-500 mb-3">Nunca visibles para el taller — solo para el equipo de GarageOS.</p>
        <div className="space-y-2 mb-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Agregar una nota..."
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button
            type="button"
            onClick={handleAddNote}
            disabled={pending || !body.trim()}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            Agregar nota
          </button>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl divide-y">
          {notes.length === 0 && <p className="p-4 text-sm text-slate-400">Sin notas todavía.</p>}
          {notes.map((n) => (
            <div key={n.id} className="p-3 text-sm">
              <p className="text-slate-900 whitespace-pre-wrap">{n.body}</p>
              <p className="text-xs text-slate-500 mt-1">
                {actorNames[n.authorUserId] ?? "Super admin"} · {fmt(n.createdAt)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-semibold text-slate-900 mb-3">Bitácora de acciones</h2>
        <p className="text-xs text-slate-500 mb-3">Toda acción sensible de super admin sobre este taller, en orden.</p>
        <div className="bg-white border border-slate-200 rounded-xl divide-y max-h-[520px] overflow-y-auto">
          {auditLog.length === 0 && <p className="p-4 text-sm text-slate-400">Sin actividad registrada.</p>}
          {auditLog.map((entry) => (
            <div key={entry.id} className="p-3 text-sm">
              <p className="font-medium text-slate-900">{ACTION_LABELS[entry.action] ?? entry.action}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {actorNames[entry.actorUserId] ?? "Super admin"} · {fmt(entry.createdAt)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
