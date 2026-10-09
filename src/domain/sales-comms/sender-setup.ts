// Sender identity setup state — pure. "Ready" is derived from live provider facts; nothing here trusts a flag that a
// human could set without the provider agreeing. Each step reports what is missing so Super Admin sees a precise blocker.
import { emailDomain } from "./email";

export interface DomainFact { found: boolean; status: string | null; sendingEnabled: boolean; receivingEnabled: boolean }

export interface SetupInput {
  providerKeyConfigured: boolean;
  providerSideEffectsEnabled: boolean;
  webhookSecretConfigured: boolean;
  unsubscribeSecretConfigured: boolean;
  settings: { sendingEnabled: boolean; approvedDomains: string[]; inboundDomain: string | null; mailingAddress: string | null; inboundProvider?: "RESEND" | "CLOUDFLARE"; inboundReplyLocal?: string | null };
  /** CLOUDFLARE inbound: SALES_INBOUND_SECRET (≥32 chars) is configured for the authenticated Worker endpoint. */
  inboundSecretConfigured?: boolean;
  identity: { fromEmail: string; status: "DRAFT" | "ACTIVE" | "DISABLED"; replyToEmail: string | null; inboundVerifiedAt: Date | null; staffActive: boolean } | null;
  /** null = not looked up (no key / lookup failed). */
  fromDomain: DomainFact | null;
  inboundDomainFact: DomainFact | null;
  lookupError: string | null;
}

export type SetupStepKey =
  | "provider_key" | "side_effects" | "domain_approved" | "domain_verified" | "identity_active" | "staff_active"
  | "master_switch" | "footer" | "unsubscribe_secret" | "webhook_secret" | "inbound_domain" | "inbound_receiving" | "inbound_worker" | "inbound_roundtrip";

export interface SetupStep { key: SetupStepKey; ok: boolean; required: "send" | "receive" | "verified"; hint?: string }

export interface SetupState {
  steps: SetupStep[];
  canSend: boolean;
  canReceive: boolean;
  /** A real inbound message has been matched to this identity: the only proof the reply path works. */
  roundTripVerified: boolean;
  headline: "READY" | "SEND_ONLY" | "BLOCKED";
}

export function computeSetupState(i: SetupInput): SetupState {
  const domain = i.identity ? emailDomain(i.identity.fromEmail) : "";
  const approved = !!domain && i.settings.approvedDomains.map((d) => d.toLowerCase()).includes(domain);
  const d = i.fromDomain;
  const verified = !!d?.found && d.status === "verified" && d.sendingEnabled;
  const inbound = i.settings.inboundDomain?.toLowerCase() ?? null;
  const inboundFact = i.inboundDomainFact;
  const cloudflare = i.settings.inboundProvider === "CLOUDFLARE";

  const steps: SetupStep[] = [
    { key: "provider_key", ok: i.providerKeyConfigured, required: "send", hint: "RESEND_API_KEY" },
    { key: "side_effects", ok: i.providerSideEffectsEnabled, required: "send", hint: "PROVIDER_SIDE_EFFECTS=enabled" },
    { key: "master_switch", ok: i.settings.sendingEnabled, required: "send" },
    { key: "footer", ok: !!i.settings.mailingAddress?.trim(), required: "send" },
    { key: "unsubscribe_secret", ok: i.unsubscribeSecretConfigured, required: "send", hint: "NEXTAUTH_SECRET" },
    { key: "staff_active", ok: !!i.identity?.staffActive, required: "send" },
    { key: "identity_active", ok: i.identity?.status === "ACTIVE", required: "send" },
    { key: "domain_approved", ok: approved, required: "send", hint: domain || undefined },
    { key: "domain_verified", ok: verified, required: "send", hint: i.lookupError ?? (d ? `${d.status ?? "unknown"}` : "not looked up") },
    // Delivery/bounce events always come from Resend; with Cloudflare inbound the Resend webhook no longer gates RECEIVING.
    { key: "webhook_secret", ok: i.webhookSecretConfigured, required: cloudflare ? "verified" : "receive", hint: "RESEND_WEBHOOK_SECRET" },
    { key: "inbound_domain", ok: !!inbound, required: "receive" },
    cloudflare
      ? { key: "inbound_worker", ok: !!i.inboundSecretConfigured, required: "receive", hint: "SALES_INBOUND_SECRET" }
      : { key: "inbound_receiving", ok: !!inboundFact?.found && inboundFact.receivingEnabled && inboundFact.status === "verified", required: "receive", hint: inbound ?? undefined },
    { key: "inbound_roundtrip", ok: !!i.identity?.inboundVerifiedAt, required: "verified" },
  ];
  const canSend = steps.filter((s) => s.required === "send").every((s) => s.ok);
  const canReceive = steps.filter((s) => s.required === "receive").every((s) => s.ok);
  const roundTripVerified = canReceive && !!i.identity?.inboundVerifiedAt;
  return { steps, canSend, canReceive, roundTripVerified, headline: canSend && canReceive ? "READY" : canSend ? "SEND_ONLY" : "BLOCKED" };
}
