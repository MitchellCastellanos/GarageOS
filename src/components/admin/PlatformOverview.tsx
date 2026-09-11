"use client";

import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createShop } from "@/actions/platform";
import { Loader2, Building2, ChevronRight, Plus } from "lucide-react";

type ShopRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  _count: { users: number; clients: number; invoices: number };
  users: { id: string; name: string; email: string; role: string }[];
};

export function PlatformOverview({ shops }: { shops: ShopRow[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createShop(formData);
      if (result?.success) {
        toast.success("Taller creado");
        setShowCreate(false);
        (e.target as HTMLFormElement).reset();
      } else {
        toast.error(result?.error ?? "Error al crear taller");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Panel de plataforma</h1>
          <p className="text-slate-500 text-sm mt-1">
            Administras todos los talleres. Carlos y su equipo solo ven el suyo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-medium px-4 py-2 rounded-lg text-sm"
        >
          <Plus className="w-4 h-4" />
          Nuevo taller
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 max-w-lg">
          <p className="font-medium text-slate-900">Registrar taller</p>
          <input name="name" placeholder="Nombre del taller" required className={inputClass} />
          <input name="email" type="email" placeholder="Email del taller (opcional)" className={inputClass} />
          <input name="phone" placeholder="Teléfono (opcional)" className={inputClass} />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowCreate(false)} className="text-sm text-slate-500 px-3 py-2">
              Cancelar
            </button>
            <button type="submit" disabled={pending} className="bg-amber-500 text-slate-950 text-sm font-medium px-4 py-2 rounded-lg">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear"}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4">
        {shops.length === 0 && (
          <p className="text-slate-500 text-sm">No hay talleres. Crea uno y asigna un dueño (Carlos).</p>
        )}
        {shops.map((shop) => {
          const owner = shop.users.find((u) => u.role === "OWNER");
          return (
            <Link
              key={shop.id}
              href={PLATFORM.shop(shop.id)}
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-amber-300 hover:shadow-sm transition-all flex items-center justify-between gap-4"
            >
              <div className="flex items-start gap-4 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-slate-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{shop.name}</p>
                  <p className="text-sm text-slate-500 truncate">
                    Dueño: {owner ? `${owner.name} (${owner.email})` : "Sin dueño asignado"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {shop._count.users} usuarios · {shop._count.clients} clientes · {shop._count.invoices} facturas
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500";
