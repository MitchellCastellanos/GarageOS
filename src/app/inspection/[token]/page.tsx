import Image from "next/image";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/subscription";
import { publicUrlForStoragePath } from "@/lib/storage";
import { isFinding } from "@/domain/inspection";
import { formatClientName } from "@/lib/client-name";
import { formatDate } from "@/lib/utils";
import { INSPECTIONS_DICT } from "@/lib/admin-locale/inspections";
import { INSPECTIONS_ADVANCED_DICT } from "@/lib/admin-locale/inspections-advanced";

export const dynamic = "force-dynamic";
// Enlace con token secreto: que no lo indexen ni lo cacheen.
export const metadata = { robots: { index: false, follow: false } };

const BADGE = {
  GOOD: "bg-emerald-100 text-emerald-700",
  ATTENTION: "bg-amber-100 text-amber-700",
  SERVICE_REQUIRED: "bg-red-100 text-red-700",
} as const;

export default async function PublicInspectionReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) notFound();

  const inspection = await db.inspection.findUnique({
    where: { shareToken: token },
    include: {
      shop: { select: { id: true, name: true } },
      client: true,
      vehicle: true,
      items: { include: { photos: { orderBy: { createdAt: "asc" } } }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!inspection) notFound();
  // El reporte compartible es Pro+: si el taller ya no tiene el plan (o está restringido), el link deja de servir.
  if (!(await can(inspection.shop.id, "dvi.customerReport"))) notFound();

  const locale = inspection.client.language === "FR" ? "fr" : "en";
  const t = INSPECTIONS_ADVANCED_DICT[locale].report;
  const base = INSPECTIONS_DICT[locale];
  const findings = inspection.items.filter((i) => isFinding(i.condition));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="rounded-2xl bg-slate-900 px-6 py-7 text-white shadow-sm sm:px-8">
          <p className="text-sm font-medium text-blue-200">{inspection.shop.name}</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{t.title}</h1>
          <p className="mt-2 text-sm text-slate-300">
            {inspection.vehicle.year} {inspection.vehicle.make} {inspection.vehicle.model} · {inspection.vehicle.licensePlate}
          </p>
          <p className="text-sm text-slate-400">
            {formatClientName(inspection.client)} · {formatDate(inspection.createdAt)}
          </p>
        </header>

        <div className={`rounded-2xl border p-4 text-sm font-medium ${findings.length > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {findings.length > 0 ? t.findings(findings.length) : t.allGood}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h2 className="px-6 pt-5 pb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            {findings.length > 0 ? t.recommended : t.checklist}
          </h2>
          <ul className="divide-y divide-slate-100">
            {(findings.length > 0 ? findings : inspection.items).map((item) => (
              <li key={item.id} className="px-6 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">{base.categoryLabel(item.category)}</p>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[item.condition]}`}>{t.conditions[item.condition]}</span>
                </div>
                {item.notes && <p className="mt-1 text-sm text-slate-600">{item.notes}</p>}
                {item.photos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.photos.map((p) => (
                      <a key={p.id} href={publicUrlForStoragePath(p.storagePath)} target="_blank" rel="noreferrer" className="relative block h-24 w-24 overflow-hidden rounded-lg border border-slate-200">
                        <Image src={publicUrlForStoragePath(p.storagePath)} alt="" fill unoptimized className="object-cover" sizes="96px" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        {findings.length > 0 && (
          <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer px-6 py-4 text-sm font-semibold text-slate-700">{t.checklist}</summary>
            <ul className="divide-y divide-slate-100">
              {inspection.items.filter((i) => !isFinding(i.condition)).map((item) => (
                <li key={item.id} className="flex items-center justify-between px-6 py-3 text-sm">
                  <span className="text-slate-800">{base.categoryLabel(item.category)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[item.condition]}`}>{t.conditions[item.condition]}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="text-center text-xs text-slate-400">{t.footer}</p>
      </div>
    </main>
  );
}
