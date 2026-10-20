import "server-only";
import { db } from "@/lib/db";
import { getAppUrl } from "@/config/app";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { evaluateSendingBasis } from "@/domain/sales-comms/casl";
import { COMMERCIAL_TEMPLATE_KEYS } from "@/domain/sales-comms/templates";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { loadAutoCaslPolicy } from "@/lib/sales-comms/auto-casl-policy";
import { getCommsSettings } from "@/lib/sales-comms/settings";
import { requireScopedProspect } from "@/lib/sales-crm/prospects";
import type { EmailComposeContext } from "@/lib/voice/workspace-types";

/** The real, public GarageOS demo destinations (no `#` anchors exist in the marketing site, so none are invented). */
export function demoLinks(): EmailComposeContext["demoLinks"] {
  const base = getAppUrl();
  return [{ key: "demo", url: `${base}/demo` }, { key: "demoBooking", url: `${base}/demo/booking` }];
}

/** Same inputs the standalone composer page loads (sender identity, approved templates, booking switch, send readiness, per-contact CASL status), for ONE prospect. */
export async function loadEmailComposeContext(actor: PlatformSalesActor, prospectId: string, locale: "en" | "fr", now = new Date()): Promise<EmailComposeContext> {
  const base = await requireScopedProspect(actor, prospectId);
  const [prospect, identity, settings, auto] = await Promise.all([
    db.crmProspect.findUniqueOrThrow({
      where: { id: prospectId },
      select: { id: true, name: true, preferredLanguage: true, contacts: { where: { archivedAt: null, doNotContact: false }, orderBy: [{ isDecisionMaker: "desc" }, { isPrimary: "desc" }, { name: "asc" }], include: { sendingBases: true } } },
    }),
    actor.staffId ? db.crmSenderIdentity.findUnique({ where: { staffId: actor.staffId }, include: { staff: { select: { timezone: true, bookingEnabled: true } } } }) : null,
    getCommsSettings(),
    loadAutoCaslPolicy(),
  ]);
  const t = commsCopy(locale);
  return {
    prospect: {
      id: base.id, name: prospect.name, language: prospect.preferredLanguage,
      contacts: prospect.contacts.filter((c) => !!c.email).map((c) => ({
        id: c.id, name: c.name, email: c.email, language: c.preferredLanguage === "FR" || c.preferredLanguage === "EN" ? c.preferredLanguage : null,
        basis: evaluateSendingBasis(c.sendingBases, now, auto, { topic: null, recipientEmail: c.email }).valid ? "valid" as const : "none" as const,
      })),
    },
    templates: COMMERCIAL_TEMPLATE_KEYS.map((k) => ({ key: k, label: t.templateNames[k] })),
    sender: identity ? { name: identity.fromName, email: identity.fromEmail } : null,
    bookingEnabled: !!identity?.staff.bookingEnabled,
    sendReady: !!identity && identity.status === "ACTIVE" && settings.sendingEnabled && settings.manualSendingEnabled,
    timezone: identity?.staff.timezone ?? "America/Toronto",
    demoLinks: demoLinks(),
  };
}
