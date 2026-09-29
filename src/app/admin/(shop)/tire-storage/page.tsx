import Link from "next/link";
import { CircleDot, Plus } from "lucide-react";
import { ADMIN, adminPath } from "@/lib/routes";
import { getTireStorageSets } from "@/actions/tire-storage";
import { getShopId } from "@/lib/shop-context";
import { canView } from "@/lib/subscription";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { TIRE_STORAGE_DICT } from "@/lib/admin-locale/tire-storage";
import { formatClientName } from "@/lib/client-name";
import { formatDate } from "@/lib/utils";
import { UpgradeCTA } from "@/components/billing/UpgradeCTA";

interface Props {
  searchParams: Promise<{ q?: string; status?: string; season?: string }>;
}

export default async function TireStoragePage({ searchParams }: Props) {
  const locale = await getAdminLocale();
  const t = TIRE_STORAGE_DICT[locale];
  const shopId = await getShopId();

  if (!(await canView(shopId, "tireStorage.manage"))) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">{t.page.title}</h1>
        <UpgradeCTA requiredPlan="PRO" title={t.locked.title} description={t.locked.description} ctaLabel={t.locked.cta} />
      </div>
    );
  }

  const sp = await searchParams;
  const status = sp.status === "CHECKED_OUT" || sp.status === "ALL" ? sp.status : "STORED";
  const season = sp.season === "WINTER" || sp.season === "SUMMER" || sp.season === "ALL_SEASON" ? sp.season : "ALL";
  const sets = await getTireStorageSets({ q: sp.q, status, season });
  const filtered = Boolean(sp.q) || status !== "STORED" || season !== "ALL";
  const field = "px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.page.title}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.page.subtitle(sets.length)}</p>
        </div>
        <Link href={`${ADMIN.tireStorage}/new`} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
          <Plus className="w-4 h-4" />
          {t.page.checkIn}
        </Link>
      </div>

      <form method="GET" action={ADMIN.tireStorage} className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder={t.page.searchPlaceholder} className={`${field} w-full max-w-sm`} />
        <select name="status" defaultValue={status} className={field}>
          <option value="STORED">{t.filters.stored}</option>
          <option value="CHECKED_OUT">{t.filters.checkedOut}</option>
          <option value="ALL">{t.filters.all}</option>
        </select>
        <select name="season" defaultValue={season} className={field}>
          <option value="ALL">{t.filters.allSeasons}</option>
          <option value="WINTER">{t.seasons.WINTER}</option>
          <option value="SUMMER">{t.seasons.SUMMER}</option>
          <option value="ALL_SEASON">{t.seasons.ALL_SEASON}</option>
        </select>
        <button className="border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg">{t.filters.apply}</button>
      </form>

      {sets.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <CircleDot className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">{filtered ? t.page.emptyFiltered : t.page.empty}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">{t.table.client}</th>
                <th className="text-left px-4 py-2.5">{t.table.tires}</th>
                <th className="text-left px-4 py-2.5">{t.table.location}</th>
                <th className="text-left px-4 py-2.5">{t.table.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sets.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={adminPath(`/tire-storage/${s.id}`)} className="font-medium text-slate-900 hover:underline">
                      {formatClientName(s.client)}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {s.vehicle ? `${s.vehicle.year} ${s.vehicle.make} ${s.vehicle.model} · ${s.vehicle.licensePlate}` : t.detail.noVehicle}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-900">{s.size} × {s.quantity}</p>
                    <p className="text-xs text-slate-500">
                      {t.seasons[s.season]} · {t.conditions[s.condition]}
                      {s.brand ? ` · ${s.brand}` : ""}
                      {s.withRims ? ` · ${t.detail.withRims}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">{s.storageLocation ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === "STORED" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {t.status[s.status]}
                    </span>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(s.status === "STORED" ? s.checkedInAt : (s.checkedOutAt ?? s.checkedInAt))}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
