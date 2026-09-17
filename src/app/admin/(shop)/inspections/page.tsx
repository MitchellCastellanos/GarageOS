import { ADMIN, adminPath } from "@/lib/routes";
import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import { getInspections } from "@/actions/inspections";
import { formatDate } from "@/lib/utils";
import { formatClientName } from "@/lib/client-name";
import { countFindings } from "@/domain/inspection";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { INSPECTIONS_DICT } from "@/lib/admin-locale/inspections";

export default async function InspectionsPage() {
  const inspections = await getInspections();
  const locale = await getAdminLocale();
  const t = INSPECTIONS_DICT[locale];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.list.title}</h1>
          <p className="text-slate-500 text-sm mt-1">
            {inspections.length} {inspections.length !== 1 ? t.list.countSuffix : t.list.countSuffixSingular}
          </p>
        </div>
        <Link
          href={`${ADMIN.inspections}/new`}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t.list.newInspection}
        </Link>
      </div>

      {inspections.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">{t.list.emptyAll}</p>
          <Link
            href={`${ADMIN.inspections}/new`}
            className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:underline text-sm"
          >
            <Plus className="w-4 h-4" />
            {t.list.createFirst}
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_150px_110px_130px] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 uppercase">
            <span>{t.list.colVehicleClient}</span>
            <span>{t.list.colMechanic}</span>
            <span>{t.list.colDate}</span>
            <span>{t.list.colFindings}</span>
          </div>

          <div className="divide-y divide-slate-100">
            {inspections.map((inspection) => {
              const findings = countFindings(inspection.items);
              return (
                <Link
                  key={inspection.id}
                  href={adminPath(`/inspections/${inspection.id}`)}
                  className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_150px_110px_130px] gap-4 px-5 py-4 items-center hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-slate-900 text-sm">
                      {inspection.vehicle.year} {inspection.vehicle.make} {inspection.vehicle.model}
                    </p>
                    <p className="text-slate-500 text-sm">{formatClientName(inspection.client)}</p>
                  </div>
                  <div className="hidden sm:block text-sm text-slate-600">
                    {inspection.mechanic?.name ?? "—"}
                  </div>
                  <div className="hidden sm:block text-sm text-slate-600">{formatDate(inspection.createdAt)}</div>
                  <div>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        findings > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {t.list.findingsCount(findings)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
