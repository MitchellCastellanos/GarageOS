"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { decideQuoteApproval } from "@/actions/quote-approvals";

export function QuoteApprovalForm({ token, shopName }: { token: string; shopName: string }) {
  const router = useRouter();
  const [actorName, setActorName] = useState("");
  const [completed, setCompleted] = useState<"ACCEPTED" | "REJECTED" | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(decision: "ACCEPTED" | "REJECTED") {
    startTransition(async () => {
      const result = await decideQuoteApproval(token, decision, actorName);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setCompleted(decision);
      router.refresh();
    });
  }

  if (completed) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white">
          {completed === "ACCEPTED" ? <Check className="h-6 w-6" /> : <X className="h-6 w-6" />}
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">
          {completed === "ACCEPTED" ? "Cotización aceptada" : "Cotización rechazada"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {shopName} recibió tu decisión. Puedes cerrar esta ventana.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-lg font-bold text-slate-900">¿Qué deseas hacer?</h2>
      <p className="mt-1 text-sm text-slate-500">Tu nombre quedará registrado junto con la decisión.</p>
      <label className="mt-5 block text-sm font-medium text-slate-700">
        Nombre
        <input
          value={actorName}
          onChange={(event) => setActorName(event.target.value)}
          placeholder="Tu nombre completo"
          maxLength={120}
          disabled={pending}
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none ring-blue-500 focus:ring-2"
        />
      </label>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={pending || !actorName.trim()}
          onClick={() => decide("ACCEPTED")}
          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Aceptar cotización
        </button>
        <button
          type="button"
          disabled={pending || !actorName.trim()}
          onClick={() => decide("REJECTED")}
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          Rechazar
        </button>
      </div>
    </section>
  );
}
