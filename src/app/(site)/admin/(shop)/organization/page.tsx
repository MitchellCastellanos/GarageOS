import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin } from "lucide-react";
import { requireShopSession } from "@/lib/permissions";
import { canView } from "@/lib/subscription";
import { getOrganizationOverview } from "@/actions/locations";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { ORGANIZATION_DICT } from "@/lib/admin-locale/organization";
import { ADMIN } from "@/lib/routes";
import { db } from "@/lib/db";
import { UpgradeCTA } from "@/components/billing/UpgradeCTA";
import { AddLocationForm, SwitchLocationButton } from "@/components/organization/LocationActions";

export default async function OrganizationPage() {
  const session = await requireShopSession();
  if (session.user.role !== "OWNER") redirect(ADMIN.dashboard);
  const t = ORGANIZATION_DICT[await getAdminLocale()];
  const shopId = session.user.shopId!;

  const entitled = await canView(shopId, "organization.multiLocation");
  const shell = (body: React.ReactNode) => (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.subtitle}</p>
      </div>
      {body}
    </div>
  );
  if (!entitled) {
    return shell(<UpgradeCTA requiredPlan="COMPLETE" title={t.upgradeTitle} description={t.upgradeDescription} />);
  }

  const overview = await getOrganizationOverview();
  if (!overview) {
    const shop = await db.shop.findUnique({ where: { id: shopId }, select: { organizationId: true } });
    if (shop?.organizationId) return shell(<p className="text-sm text-slate-600">{t.notAdmin}</p>);
    return shell(
      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h2 className="font-semibold text-slate-900">{t.noOrgTitle}</h2>
        <p className="text-sm text-slate-500">{t.noOrgBody}</p>
        <AddLocationForm label={t.createFirst} />
      </section>
    );
  }

  return shell(
    <>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={`${ADMIN.reports}?kind=locations`} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">{t.compareCta}</Link>
        <Link href={`${ADMIN.reports}?location=all`} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50">{t.reportsCta}</Link>
        <Link href={`${ADMIN.settings}?tab=locations`} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50">{t.manageAccess}</Link>
      </div>

      <section aria-labelledby="org-locations" className="space-y-3">
        <div>
          <h2 id="org-locations" className="font-semibold text-slate-900">{overview.organizationName} — {t.locationsHeading}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{t.isolation}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {overview.locations.map((l) => (
            <li key={l.id} className={`bg-white rounded-xl border p-4 space-y-3 ${l.isActive ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <h3 className="font-medium text-slate-900 truncate">{l.name}</h3>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {l.isActive && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{t.activeBadge}</span>}
                  {l.isRoot && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{t.mainBadge}</span>}
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div><dd className="text-lg font-bold text-slate-900">{l.openWorkOrders}</dd><dt className="text-[11px] text-slate-500">{t.openWo}</dt></div>
                <div><dd className="text-lg font-bold text-slate-900">{l.clients}</dd><dt className="text-[11px] text-slate-500">{t.customers}</dt></div>
                <div><dd className="text-lg font-bold text-slate-900">{l.teamMembers}</dd><dt className="text-[11px] text-slate-500">{t.team}</dt></div>
              </dl>
              {!l.isActive && <SwitchLocationButton shopId={l.id} />}
            </li>
          ))}
        </ul>
        {overview.additionalLocations > 0 && (
          <p className="text-xs text-slate-500">{t.additionalLocations(overview.additionalLocations)}. {t.billingNote}</p>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h2 className="font-semibold text-slate-900">{t.addLocation}</h2>
        <AddLocationForm label={t.addLocation} />
      </section>
    </>
  );
}
