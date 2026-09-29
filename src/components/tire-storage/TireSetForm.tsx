"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ClientCombobox } from "@/components/invoices/ClientCombobox";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { TIRE_STORAGE_DICT } from "@/lib/admin-locale/tire-storage";
import { TIRE_CONDITIONS, TIRE_SEASONS } from "@/domain/tire-storage";
import { ADMIN } from "@/lib/routes";
import type { TireStorageFormData } from "@/lib/validations";

interface ClientOption {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  vehicles: { id: string; make: string; model: string; year: number; licensePlate: string }[];
}

interface Props {
  clients: ClientOption[];
  initial?: Partial<TireStorageFormData>;
  mode: "create" | "edit";
  onSubmit: (data: TireStorageFormData) => Promise<{ error?: Record<string, string[]> } | void>;
  cancelHref?: string;
}

const field = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export function TireSetForm({ clients, initial, mode, onSubmit, cancelHref }: Props) {
  const locale = useAdminLocale();
  const t = TIRE_STORAGE_DICT[locale];
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [v, setV] = useState<TireStorageFormData>({
    clientId: "",
    vehicleId: "",
    season: "WINTER",
    brand: "",
    model: "",
    size: "",
    quantity: 4,
    condition: "GOOD",
    withRims: false,
    storageLocation: "",
    notes: "",
    ...initial,
  });
  const set = <K extends keyof TireStorageFormData>(k: K, val: TireStorageFormData[K]) => setV((p) => ({ ...p, [k]: val }));
  const vehicles = clients.find((c) => c.id === v.clientId)?.vehicles ?? [];
  const err = (k: string) => errors[k]?.map((m) => t.errors[m] ?? m).join(" ");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await onSubmit(v);
      if (res?.error) setErrors(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      {err("_form") && <p className="text-sm text-red-600">{err("_form")}</p>}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.client}</label>
          <ClientCombobox clients={clients} value={v.clientId} onChange={(id) => setV((p) => ({ ...p, clientId: id, vehicleId: "" }))} hasError={!!err("clientId")} />
          {err("clientId") && <p className="text-xs text-red-600 mt-1">{err("clientId")}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.vehicle}</label>
          <select className={field} value={v.vehicleId ?? ""} onChange={(e) => set("vehicleId", e.target.value)} disabled={!v.clientId}>
            <option value="">{t.form.noVehicle}</option>
            {vehicles.map((x) => (
              <option key={x.id} value={x.id}>{x.year} {x.make} {x.model} · {x.licensePlate}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.season}</label>
          <select className={field} value={v.season} onChange={(e) => set("season", e.target.value as TireStorageFormData["season"])}>
            {TIRE_SEASONS.map((s) => <option key={s} value={s}>{t.seasons[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.size}</label>
          <input className={field} value={v.size} placeholder={t.form.sizeHint} onChange={(e) => set("size", e.target.value)} />
          {err("size") && <p className="text-xs text-red-600 mt-1">{err("size")}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.brand}</label>
          <input className={field} value={v.brand ?? ""} onChange={(e) => set("brand", e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.model}</label>
          <input className={field} value={v.model ?? ""} onChange={(e) => set("model", e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.quantity}</label>
          <input className={field} type="number" min={1} max={12} value={v.quantity} onChange={(e) => set("quantity", Number(e.target.value))} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.condition}</label>
          <select className={field} value={v.condition} onChange={(e) => set("condition", e.target.value as TireStorageFormData["condition"])}>
            {TIRE_CONDITIONS.map((c) => <option key={c} value={c}>{t.conditions[c]}</option>)}
          </select>
        </div>
        {mode === "create" && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.location}</label>
            <input className={field} value={v.storageLocation ?? ""} placeholder={t.form.locationHint} onChange={(e) => set("storageLocation", e.target.value)} />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700 self-end pb-2">
          <input type="checkbox" checked={v.withRims} onChange={(e) => set("withRims", e.target.checked)} />
          {t.form.withRims}
        </label>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.form.notes}</label>
        <textarea className={field} rows={3} value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
          {mode === "create" ? t.form.submitNew : t.form.submitEdit}
        </button>
        <Link href={cancelHref ?? ADMIN.tireStorage} className="border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2.5 rounded-lg">
          {t.form.cancel}
        </Link>
      </div>
    </form>
  );
}
