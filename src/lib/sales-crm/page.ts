import "server-only";
import { crmCopy } from "@/lib/admin-locale/sales-crm";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { getCrmPageActor } from "@/lib/sales-crm/access";
import type { SalesCapability } from "@/domain/sales-crm/access";

/** One call per page: the actor (null → render <PermissionDenied/>) and the copy in the viewer's language. */
export async function loadCrmPage(capability: SalesCapability) {
  const actor = await getCrmPageActor(capability);
  const locale = actor ? actor.uiLocale : (await getAdminLocale()) === "fr" ? "fr" : "en";
  return { actor, locale: locale as "en" | "fr", t: crmCopy(locale as "en" | "fr") };
}
