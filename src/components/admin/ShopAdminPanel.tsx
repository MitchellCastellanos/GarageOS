"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createShopOwner,
  createShopUser,
  resetShopUserPassword,
  deleteShopUser,
} from "@/actions/platform";
import { ArrowLeft, KeyRound, Loader2, Trash2, UserPlus } from "lucide-react";
import { PLATFORM } from "@/lib/routes";

type ShopDetail = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  _count: { clients: number; invoices: number };
  users: { id: string; name: string; email: string; role: string; createdAt: Date }[];
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Dueño",
  MECHANIC: "Mecánico",
  VIEWER: "Solo lectura",
};

export function ShopAdminPanel({ shop }: { shop: ShopDetail }) {
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [showOwner, setShowOwner] = useState(shop.users.every((u) => u.role !== "OWNER"));
  const [showUser, setShowUser] = useState(false);
  const [pending, startTransition] = useTransition();

  const hasOwner = shop.users.some((u) => u.role === "OWNER");

  function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("shopId", shop.id);
    startTransition(async () => {
      const result = await resetShopUserPassword(formData);
      if (result?.success) {
        toast.success("Contraseña actualizada");
        setResetUserId(null);
      } else toast.error(result?.error ?? "Error");
    });
  }

  function handleDelete(userId: string, name: string) {
    if (!confirm(`¿Eliminar a ${name}?`)) return;
    startTransition(async () => {
      const result = await deleteShopUser(userId, shop.id);
      if (result?.success) toast.success("Usuario eliminado");
      else toast.error(result?.error ?? "Error");
    });
  }

  return (
    <div className="space-y-6">
      <Link href={PLATFORM.home} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="w-4 h-4" />
        Todos los talleres
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{shop.name}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {shop._count.clients} clientes · {shop._count.invoices} facturas
        </p>
      </div>

      {!hasOwner && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          Este taller no tiene dueño. Crea la cuenta del dueño aquí (rol Dueño).
        </div>
      )}

      {showOwner && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            formData.set("shopId", shop.id);
            startTransition(async () => {
              const result = await createShopOwner(formData);
              if (result?.success) {
                toast.success("Dueño creado");
                setShowOwner(false);
              } else toast.error(result?.error ?? "Error");
            });
          }}
          className="bg-white border border-amber-200 rounded-xl p-5 space-y-3 max-w-lg"
        >
          <p className="font-medium">Crear dueño del taller</p>
          <input name="name" placeholder="Nombre del dueño" required className={inputClass} />
          <input name="email" type="email" placeholder="Email de login" required className={inputClass} />
          <input name="password" type="password" placeholder="Contraseña temporal" required minLength={8} className={inputClass} />
          <button type="submit" disabled={pending} className="bg-amber-500 text-slate-950 text-sm font-medium px-4 py-2 rounded-lg">
            Crear dueño
          </button>
        </form>
      )}

      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-slate-900">Usuarios del taller</h2>
        <button
          type="button"
          onClick={() => setShowUser(!showUser)}
          className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          <UserPlus className="w-4 h-4" />
          Agregar usuario
        </button>
      </div>

      {showUser && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            formData.set("shopId", shop.id);
            startTransition(async () => {
              const result = await createShopUser(formData);
              if (result?.success) {
                toast.success("Usuario creado");
                setShowUser(false);
                (e.target as HTMLFormElement).reset();
              } else toast.error(result?.error ?? "Error");
            });
          }}
          className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-3 max-w-lg"
        >
          <input name="name" placeholder="Nombre" required className={inputClass} />
          <input name="email" type="email" placeholder="Email" required className={inputClass} />
          <input name="password" type="password" placeholder="Contraseña" required minLength={8} className={inputClass} />
          <select name="role" defaultValue="MECHANIC" className={inputClass}>
            <option value="MECHANIC">Mecánico</option>
            <option value="VIEWER">Solo lectura</option>
            <option value="OWNER">Dueño</option>
          </select>
          <button type="submit" disabled={pending} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
            Crear
          </button>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl divide-y">
        {shop.users.map((user) => (
          <div key={user.id} className="p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{user.name}</p>
                <p className="text-sm text-slate-500">{user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
                <button
                  type="button"
                  onClick={() => setResetUserId(resetUserId === user.id ? null : user.id)}
                  className="p-2 text-slate-500 hover:text-amber-600 rounded-lg"
                  title="Restablecer contraseña"
                >
                  <KeyRound className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(user.id, user.name)}
                  className="p-2 text-slate-500 hover:text-red-600 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {resetUserId === user.id && (
              <form onSubmit={handleReset} className="flex flex-wrap gap-2 items-end pt-1">
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="shopId" value={shop.id} />
                <input
                  name="newPassword"
                  type="password"
                  placeholder="Nueva contraseña"
                  required
                  minLength={8}
                  className={`${inputClass} flex-1 min-w-[180px]`}
                />
                <button type="submit" disabled={pending} className="bg-slate-800 text-white text-sm px-4 py-2 rounded-lg h-[38px]">
                  {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
                </button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500";
