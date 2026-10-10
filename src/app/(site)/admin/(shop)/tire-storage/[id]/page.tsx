import Link from "next/link";
import { ChevronLeft, Pencil } from "lucide-react";
import { ADMIN, adminPath } from "@/lib/routes";
import { getTireStorageSet } from "@/actions/tire-storage";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { TIRE_STORAGE_DICT } from "@/lib/admin-locale/tire-storage";
import { formatClientName } from "@/lib/client-name";
import { formatDate } from "@/lib/utils";
import { TireSetActions } from "@/components/tire-storage/TireSetActions";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TireSetDetailPage({ params }: Props) {
  const { id } = await params;
  const [set, locale] = await Promise.all([getTireStorageSet(id), getAdminLocale()]);
  const t = TIRE_STORAGE_DICT[locale];
  const stored = set.status === "STORED";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <Link href={ADMIN.tireStorage} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-2">
            <ChevronLeft className="w-4 h-4" />
            {t.detail.back}
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{set.size} × {set.quantity}</h1>
          <p className="text-slate-500 text-sm mt-1">
            <Link href={adminPath(`/clients/${set.clientId}`)} className="hover:underline">{formatClientName(set.client)}</Link>
            {set.vehicle && (
              <>
                {" · "}
                <Link href={adminPath(`/vehicles/${set.vehicle.id}`)} className="hover:underline">
                  {set.vehicle.year} {set.vehicle.make} {set.vehicle.model} ({set.vehicle.licensePlate})
                </Link>
              </>
            )}
          </p>
        </div>
        <Link href={adminPath(`/tire-storage/${id}/edit`)} className="flex items-center gap-1.5 border border-slate-300 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg">
          <Pencil className="w-3.5 h-3.5" />
          {t.detail.edit}
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 grid sm:grid-cols-2 gap-4 text-sm">
        <Info label={t.form.season} value={t.seasons[set.season]} />
        <Info label={t.form.condition} value={t.conditions[set.condition]} />
        <Info label={t.form.brand} value={[set.brand, set.model].filter(Boolean).join(" ") || "—"} />
        <Info label={t.detail.withRims} value={set.withRims ? t.detail.withRims : t.detail.noRims} />
        <Info label={t.detail.location} value={set.storageLocation ?? t.detail.noLocation} mono={!!set.storageLocation} />
        <Info label={t.table.status} value={t.status[set.status]} />
        <Info label={t.detail.checkedInOn} value={formatDate(set.checkedInAt)} />
        {stored && <Info label={t.detail.expectedPickup} value={set.expectedPickupDate ? `${set.expectedPickupDate.toISOString().slice(0, 10)} · ${t.detail.remindersOn}` : t.detail.noExpectedPickup} />}
        {set.checkedOutAt && <Info label={t.detail.checkedOutOn} value={formatDate(set.checkedOutAt)} />}
        {set.notes && <div className="sm:col-span-2"><Info label={t.form.notes} value={set.notes} /></div>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <TireSetActions id={set.id} status={stored ? "STORED" : "CHECKED_OUT"} location={set.storageLocation} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        <h2 className="px-5 py-4 border-b border-slate-100 font-semibold text-slate-900">{t.detail.history}</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {set.events.map((e) => (
            <li key={e.id} className="px-5 py-3 flex flex-wrap gap-x-3">
              <span className="text-slate-400">{formatDate(e.createdAt)}</span>
              <span className="font-medium text-slate-800">{t.events[e.type]}</span>
              {e.location && <span className="font-mono text-slate-600">{e.location}</span>}
              {e.note && <span className="text-slate-500">{e.note}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase text-slate-400">{label}</p>
      <p className={`text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
