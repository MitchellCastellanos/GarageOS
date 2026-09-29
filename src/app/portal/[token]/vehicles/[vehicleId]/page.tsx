import Link from "next/link";
import { notFound } from "next/navigation";
import { getPortalClient, getPortalShop, getPortalVehicleHistory, resolvePortalAccess } from "@/lib/portal";
import { PORTAL_STRINGS, formatPortalDate, formatPortalMoney, resolvePortalLang } from "@/lib/portal-i18n";
import { PortalShell, PortalSection, PortalEmpty, StatusPill, portalLinkClass } from "@/components/portal/PortalShell";
import { PortalLinkExpired } from "@/components/portal/PortalLinkExpired";

export const dynamic = "force-dynamic";

export default async function PortalVehiclePage({ params }: { params: Promise<{ token: string; vehicleId: string }> }) {
  const { token, vehicleId } = await params;
  const resolved = await resolvePortalAccess(token);
  if (!resolved.ok) {
    if (resolved.reason === "INVALID") notFound();
    return <PortalLinkExpired shopName={resolved.shopName} shopSlug={resolved.shopSlug} />;
  }
  const { access } = resolved;
  const [shop, client, data] = await Promise.all([getPortalShop(access), getPortalClient(access), getPortalVehicleHistory(access, vehicleId)]);
  // Un vehículo de otro cliente/taller es indistinguible de uno inexistente.
  if (!shop || !client || !data) notFound();

  const lang = resolvePortalLang(client.language);
  const t = PORTAL_STRINGS[lang];
  const tz = shop.timezone;
  const { vehicle } = data;

  return (
    <PortalShell shop={shop} lang={lang} title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} subtitle={[vehicle.licensePlate, vehicle.color].filter(Boolean).join(" · ")}>
      <Link href={`/portal/${token}`} className={portalLinkClass}>← {t.back}</Link>

      {data.reminders.length > 0 && (
        <PortalSection id="v-reminders" title={t.sections.reminders}>
          <ul className="divide-y divide-slate-100">
            {data.reminders.map((r) => (
              <li key={r.id} className="px-4 py-3 sm:px-5">
                <p className="font-medium">{r.serviceType}</p>
                <p className="mt-0.5 text-sm text-slate-500">{t.dueService(r.dueDate ? formatPortalDate(r.dueDate, lang, tz) : null, r.dueMileage)}</p>
              </li>
            ))}
          </ul>
        </PortalSection>
      )}

      <PortalSection id="v-history" title={t.sections.history}>
        {data.workOrders.length === 0 ? <PortalEmpty>{t.empty.history}</PortalEmpty> : (
          <ul className="divide-y divide-slate-100">
            {data.workOrders.map((w) => (
              <li key={w.id} className="space-y-1.5 px-4 py-3 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{formatPortalDate(w.createdAt, lang, tz)}</p>
                    <p className="text-sm text-slate-500">{t.orderNumber(w.orderNumber)}{w.mileageIn ? ` · ${w.mileageIn.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA")}` : ""}</p>
                  </div>
                  <StatusPill tone={w.status === "COMPLETED" || w.status === "INVOICED" ? "green" : "blue"}>
                    {w.status === "COMPLETED" || w.status === "INVOICED" ? t.workOrderStatus[w.status] : t.jobStatus[w.jobStatus] ?? w.status}
                  </StatusPill>
                </div>
                <p className="text-sm text-slate-700">{w.concern}</p>
                {w.lines.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                    {w.lines.map((l) => <li key={l.id}>{l.description}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </PortalSection>

      {data.invoices.length > 0 && (
        <PortalSection id="v-invoices" title={t.sections.invoices}>
          <ul className="divide-y divide-slate-100">
            {data.invoices.map((i) => (
              <li key={i.id}>
                <Link href={`/portal/${token}/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <div>
                    <p className="font-medium">{i.invoiceNumber}</p>
                    <p className="text-sm text-slate-500">{formatPortalDate(i.issuedAt, lang, tz)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-semibold">{formatPortalMoney(i.total.toString(), lang)}</span>
                    <StatusPill tone={i.status === "PAID" ? "green" : i.status === "OVERDUE" ? "red" : "amber"}>{t.invoiceStatus[i.status] ?? i.status}</StatusPill>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </PortalSection>
      )}

      {data.inspections.length > 0 && (
        <PortalSection id="v-dvi" title={t.sections.inspections}>
          <ul className="divide-y divide-slate-100">
            {data.inspections.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <span className="font-medium">{formatPortalDate(i.createdAt, lang, tz)}</span>
                <Link href={`/inspection/${i.shareToken}`} className={portalLinkClass}>{t.viewReport}</Link>
              </li>
            ))}
          </ul>
        </PortalSection>
      )}
    </PortalShell>
  );
}
