import "server-only";
import { db } from "@/lib/db";
import { providerSideEffectsEnabled } from "@/lib/provider-policy";
import { computeSetupState, type DomainFact, type SetupState } from "@/domain/sales-comms/sender-setup";
import { emailDomain } from "@/domain/sales-comms/email";
import { getCommsSettings, inboundSecretConfigured, providerKeyConfigured, unsubscribeSecret, webhookSecretConfigured } from "@/lib/sales-comms/settings";
import { lookupProviderDomains } from "@/lib/sales-comms/provider";

export interface IdentitySetup { state: SetupState; lookupError: string | null }

/** Live setup state of one identity: provider domain status is READ from the provider, never assumed. */
export async function getIdentitySetup(identityId: string, domainsOverride?: Awaited<ReturnType<typeof lookupProviderDomains>>): Promise<IdentitySetup> {
  const [settings, identity] = await Promise.all([
    getCommsSettings(),
    db.crmSenderIdentity.findUnique({ where: { id: identityId }, include: { staff: { select: { status: true } } } }),
  ]);
  const lookup = domainsOverride ?? (providerKeyConfigured() ? await lookupProviderDomains() : ({ ok: false, error: "RESEND_API_KEY is not configured" } as const));
  const find = (name: string | null): DomainFact | null => (!lookup.ok || !name ? null : lookup.domains.get(name.toLowerCase()) ?? { found: false, status: null, sendingEnabled: false, receivingEnabled: false });
  const state = computeSetupState({
    providerKeyConfigured: providerKeyConfigured(), providerSideEffectsEnabled: providerSideEffectsEnabled(), webhookSecretConfigured: webhookSecretConfigured(), unsubscribeSecretConfigured: unsubscribeSecret().length >= 16,
    settings: { sendingEnabled: settings.sendingEnabled, approvedDomains: settings.approvedDomains, inboundDomain: settings.inboundDomain, mailingAddress: settings.mailingAddress, inboundProvider: settings.inboundProvider, inboundReplyLocal: settings.inboundReplyLocal }, inboundSecretConfigured: inboundSecretConfigured(),
    identity: identity ? { fromEmail: identity.fromEmail, status: identity.status, replyToEmail: identity.replyToEmail, inboundVerifiedAt: identity.inboundVerifiedAt, staffActive: identity.staff.status === "ACTIVE" } : null,
    fromDomain: identity ? find(emailDomain(identity.fromEmail)) : null, inboundDomainFact: find(settings.inboundDomain), lookupError: lookup.ok ? null : lookup.error,
  });
  return { state, lookupError: lookup.ok ? null : lookup.error };
}

export async function getAllIdentitySetups() {
  const lookup = providerKeyConfigured() ? await lookupProviderDomains() : ({ ok: false, error: "RESEND_API_KEY is not configured" } as const);
  const identities = await db.crmSenderIdentity.findMany({ include: { staff: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { createdAt: "asc" } });
  return Promise.all(identities.map(async (identity) => ({ identity, setup: await getIdentitySetup(identity.id, lookup) })));
}
