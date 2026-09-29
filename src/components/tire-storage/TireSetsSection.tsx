import Link from "next/link";
import { CircleDot, Plus } from "lucide-react";
import { adminPath } from "@/lib/routes";
import type { TireStorageDictionary } from "@/lib/admin-locale/tire-storage";

interface SetRow {
  id: string;
  size: string;
  quantity: number;
  season: "WINTER" | "SUMMER" | "ALL_SEASON";
  status: "STORED" | "CHECKED_OUT";
  storageLocation: string | null;
}

/** Sección "Tire storage" de las fichas de cliente/vehículo (solo se renderiza si el plan lo incluye). */
export function TireSetsSection({ sets, checkInHref, t }: { sets: SetRow[]; checkInHref: string; t: TireStorageDictionary }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CircleDot className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-slate-900">{t.section.title}</h2>
        </div>
        <Link href={checkInHref} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
          <Plus className="w-3.5 h-3.5" />
          {t.section.checkIn}
        </Link>
      </div>
      {sets.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-400">{t.section.empty}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {sets.map((s) => (
            <Link key={s.id} href={adminPath(`/tire-storage/${s.id}`)} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
              <div>
                <p className="text-sm font-medium text-slate-900">{s.size} × {s.quantity}</p>
                <p className="text-xs text-slate-500">
                  {t.seasons[s.season]}
                  {s.storageLocation ? ` · ${s.storageLocation}` : ""}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === "STORED" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {t.status[s.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
