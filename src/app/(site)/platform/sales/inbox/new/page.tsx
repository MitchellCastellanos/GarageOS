import { db } from "@/lib/db";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { composeProspects } from "@/lib/sales-comms/queries";
import { Composer, type ComposerInitial } from "@/components/sales-comms/Composer";
import { COMMERCIAL_TEMPLATE_KEYS } from "@/domain/sales-comms/templates";
import { evaluateSendingBasis } from "@/domain/sales-comms/casl";
import { getCommsSettings } from "@/lib/sales-comms/settings";
import { applyTemplate } from "@/lib/sales-comms/compose";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ComposePage({ searchParams }: { searchParams: Promise<SP> }) {
  const { actor, t: crm, locale } = await loadCrmPage("send_sales_email");
  if (!actor) return <PermissionDenied t={crm} />;
  const t = commsCopy(locale);
  const sp = await searchParams;
  const now = new Date();
  const [prospects, identity] = await Promise.all([
    composeProspects(actor),
    actor.staffId ? db.crmSenderIdentity.findUnique({ where: { staffId: actor.staffId }, include: { staff: { select: { timezone: true, bookingEnabled: true } } } }) : null,
  ]);
  const settings = await getCommsSettings();

  // Resume a draft owned by this seller, or start fresh (optionally pre-selecting prospect/contact/template from the query string).
  const draft = one(sp.draft) ? await db.crmEmailMessage.findFirst({ where: { id: one(sp.draft), authorUserId: actor.userId, status: "DRAFT" }, include: { attachments: { select: { id: true, filename: true, sizeBytes: true } } } }) : null;
  const prospectId = draft?.prospectId ?? (one(sp.prospect) || null);
  const p = prospects.find((x) => x.id === prospectId);
  const contactId = draft?.contactId ?? (one(sp.contact) || p?.contacts[0]?.id || null);
  const contact = p?.contacts.find((c) => c.id === contactId);
  // ?template=KEY with a prospect pre-fills subject/body from the approved template (language resolved; a human still presses Send).
  const tplKey = !draft && p && (COMMERCIAL_TEMPLATE_KEYS as readonly string[]).includes(one(sp.template)) ? one(sp.template) : "";
  const tpl = tplKey && p ? await applyTemplate(actor, { templateKey: tplKey, prospectId: p.id, contactId: contact?.id ?? null, languageOverride: null }).catch(() => null) : null;
  const initial: ComposerInitial = {
    messageId: draft?.id ?? null, threadId: draft?.threadId ?? null, prospectId: p?.id ?? null, contactId: contact?.id ?? null,
    to: draft?.toAddresses.join(", ") ?? contact?.email ?? "", cc: draft?.ccAddresses.join(", ") ?? "", bcc: "", subject: draft?.subject ?? (tpl?.ok ? tpl.subject : ""), body: draft?.bodyText ?? (tpl?.ok ? tpl.body : ""),
    templateKey: draft?.templateKey ?? ((COMMERCIAL_TEMPLATE_KEYS as readonly string[]).includes(one(sp.template)) ? one(sp.template) : ""), languageOverride: draft?.languageSource === "override" && (draft.language === "EN" || draft.language === "FR") ? draft.language : "",
  };
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={t.composer.title} />
      <Composer
        locale={locale} initial={initial} isReply={false} timezone={identity?.staff.timezone ?? "America/Toronto"}
        prospects={prospects.map((x) => ({
          id: x.id, name: x.name, language: x.preferredLanguage,
          contacts: x.contacts.filter((c) => !c.doNotContact).map((c) => ({ id: c.id, name: c.name, email: c.email, language: c.preferredLanguage === "FR" || c.preferredLanguage === "EN" ? c.preferredLanguage : null, basis: evaluateSendingBasis(c.sendingBases, now).valid ? "valid" as const : "none" as const })),
        }))}
        templates={COMMERCIAL_TEMPLATE_KEYS.map((k) => ({ key: k, label: t.templateNames[k] }))}
        sender={identity ? { name: identity.fromName, email: identity.fromEmail } : null} bookingEnabled={!!identity?.staff.bookingEnabled} sendReady={!!identity && identity.status === "ACTIVE" && settings.sendingEnabled}
        attachments={draft?.attachments ?? []}
      />
    </div>
  );
}
