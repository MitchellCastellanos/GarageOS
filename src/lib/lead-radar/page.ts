import "server-only";
import { crmCopy } from "@/lib/admin-locale/sales-crm";
import { radarCopy } from "@/lib/admin-locale/lead-radar";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { getLeadRadarPageActor, type LeadRadarNeed } from "@/lib/lead-radar/access";

/** One call per page: actor + access (null → render <PermissionDenied/>), localized copy. */
export async function loadRadarPage(need: LeadRadarNeed) {
  const r = await getLeadRadarPageActor(need);
  const locale = (r ? r.actor.uiLocale : (await getAdminLocale()) === "fr" ? "fr" : "en") as "en" | "fr";
  return { actor: r?.actor ?? null, access: r?.access ?? null, locale, t: crmCopy(locale), c: radarCopy(locale) };
}
