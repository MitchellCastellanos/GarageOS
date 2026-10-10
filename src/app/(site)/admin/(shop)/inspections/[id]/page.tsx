import { ADMIN } from "@/lib/routes";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getInspectionById, getInspectionCapabilities } from "@/actions/inspections";
import { headers } from "next/headers";
import { ShareReportPanel } from "@/components/inspections/ShareReportPanel";
import { UpgradeCTA } from "@/components/billing/UpgradeCTA";
import { INSPECTIONS_ADVANCED_DICT } from "@/lib/admin-locale/inspections-advanced";
import { trySignedUrlForPrivateDocument } from "@/lib/storage";
import { formatDate } from "@/lib/utils";
import { formatClientName } from "@/lib/client-name";
import { countFindings } from "@/domain/inspection";
import { InspectionChecklist } from "@/components/inspections/InspectionChecklist";
import { InspectionActions } from "@/components/inspections/InspectionActions";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { INSPECTIONS_DICT } from "@/lib/admin-locale/inspections";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InspectionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [inspection, caps] = await Promise.all([getInspectionById(id), getInspectionCapabilities()]);
  const locale = await getAdminLocale();
  const adv = INSPECTIONS_ADVANCED_DICT[locale];
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}`;
  const t = INSPECTIONS_DICT[locale];

  const findings = countFindings(inspection.items);
  // Fotos DVI privadas: URLs firmadas temporales, emitidas tras cargar la inspección del propio taller.
  const items = await Promise.all(
    inspection.items.map(async (item) => ({
      id: item.id,
      category: item.category,
      condition: item.condition,
      notes: item.notes,
      photos: await Promise.all(
        (caps.photosView ? item.photos : []).map(async (photo) => ({
          id: photo.id,
          url: (await trySignedUrlForPrivateDocument(inspection.shopId, photo.storagePath)) ?? "",
        }))
      ),
    }))
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={ADMIN.inspections}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {inspection.vehicle.year} {inspection.vehicle.make} {inspection.vehicle.model}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {t.detail.openedOn(formatDate(inspection.createdAt))}
              {inspection.workOrder && ` · ${t.detail.fromWorkOrder(inspection.workOrder.orderNumber)}`}
            </p>
          </div>
        </div>

        <InspectionActions inspectionId={inspection.id} findingsCount={findings} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{t.detail.client}</p>
          <p className="font-semibold text-slate-900">{formatClientName(inspection.client)}</p>
          {inspection.client.email && <p className="text-sm text-slate-600 mt-1">{inspection.client.email}</p>}
          {inspection.client.phone && <p className="text-sm text-slate-600">{inspection.client.phone}</p>}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{t.detail.vehicle}</p>
          <p className="text-sm text-slate-600">{t.detail.plate(inspection.vehicle.licensePlate)}</p>
          <p className="text-sm text-slate-600 mt-1">{t.detail.mechanic}: {inspection.mechanic?.name ?? t.detail.unassigned}</p>
          {inspection.mileage && (
            <p className="text-sm text-slate-600 mt-1">
              {t.detail.mileage(inspection.mileage.toLocaleString(), inspection.vehicle.mileageUnit)}
            </p>
          )}
        </div>
      </div>

      <div
        className={`rounded-xl border p-4 text-sm font-medium ${
          findings > 0 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"
        }`}
      >
        {findings > 0 ? t.detail.findingsSummary(findings) : t.detail.noFindings}
      </div>

      {!caps.photosView && !caps.photos && (
        <UpgradeCTA compact requiredPlan="PRO" title={adv.photosLocked.title} description={adv.photosLocked.description} />
      )}

      <InspectionChecklist inspectionId={inspection.id} items={items} photos={{ view: caps.photosView, upload: caps.photos }} />

      <ShareReportPanel
        inspectionId={inspection.id}
        initialPath={inspection.shareToken ? `/inspection/${inspection.shareToken}` : null}
        canShare={caps.report}
        origin={origin}
      />
    </div>
  );
}
