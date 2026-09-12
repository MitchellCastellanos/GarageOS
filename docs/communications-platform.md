# GarageOS Communications Platform — Product & Architecture Reference

> **Status: reference / target direction, not an implementation spec.**
>
> This document describes the communication capabilities we want GarageOS to grow into. Before implementing anything from here, inspect the current codebase, schema, existing Resend/Twilio integration, email routing, appointment notifications, invoice/quote flows, permissions, tenant isolation, roadmap, and existing UI. Reuse and extend what already exists where it is sound. Do **not** blindly replace working code to match examples in this document.
>
> The goal is for Claude (or any future developer) to understand the product direction and then design the implementation so it fits the architecture that actually exists at that time.

## 1. Product goal

GarageOS should treat customer communication as a first-class platform capability rather than a collection of ad-hoc `sendEmail()` / `sendSms()` calls.

Every shop should be able to communicate with its own customers through GarageOS using:

- Transactional email
- Transactional SMS
- Editable templates
- Event-driven automations
- Appointment confirmations and reminders
- Quote / estimate delivery and approval notifications
- Work-order status notifications
- Invoice delivery, payment receipts, and overdue reminders
- Service reminders
- Eventually, two-way customer messaging / unified inbox

This capability must remain **multi-tenant**. Templates, sender identity, customer consent, automation configuration, usage, logs, and provider resources belong to a shop and must never leak across shops.

GarageOS itself owns the orchestration layer. Resend, Twilio, or future providers are transport providers, not the source of truth for communication state.

## 2. Existing code is the starting point

The repository already contains partial communication functionality. At the time this reference was written, examples include:

- Resend-backed transactional emails
- Twilio-backed SMS
- Appointment confirmation/reminder/cancellation notifications
- Invoice and quote email delivery
- Service reminders
- Shop-level email fields and routing logic
- Email/SMS sent timestamps and send counters on some business entities
- `src/lib/email-config.ts` with channel-based email routing
- Existing `Shop` settings such as `appointmentEmailsEnabled`, `appointmentSmsEnabled`, `appointmentReminderHours`, `email`, `infoEmail`, etc.

The implementation should first audit these paths and decide what can be generalized rather than duplicated.

A likely evolution is to move from business modules calling providers directly toward something like:

```text
Business event
    ↓
GarageOS communication/orchestration layer
    ↓
Template + variables + shop settings + consent + entitlement
    ↓
Message/outbox record
    ↓
Provider adapter
    ├── Email → Resend
    └── SMS   → Twilio
    ↓
Webhook/status updates
    ↓
GarageOS delivery history / usage ledger
```

Do not introduce this abstraction only for architectural aesthetics. It should be introduced where it removes duplicated logic, provides reliable retries/idempotency, improves tenant isolation, and makes automation/templates possible.

## 3. Sender identity when the shop does NOT own a domain

A shop must not be required to own or configure a domain just to use GarageOS.

### Recommended default

GarageOS should provide a managed sender identity out of the box.

Preferred model:

```text
Display name:  Garage Tremblay
From:          notifications@send.garageos.com
Reply-To:      service@garagetremblay.ca
```

or another GarageOS-controlled transactional subdomain chosen during implementation.

The important UX principle is that the **display name is the shop**, while the infrastructure address is clearly managed by GarageOS.

Example:

```text
Garage Tremblay <notifications@send.garageos.com>
```

A shop-specific local part may be used if useful for routing/readability:

```text
garage-tremblay@send.garageos.com
```

### Shop-specific subdomain option

Technically we can also create identities such as:

```text
notifications@garage-tremblay.garageos.com
```

This is valid, but should **not** be assumed to provide complete reputation or provider isolation merely because the hostname differs. Provider account reputation, abuse, bounce/complaint rates, and the organizational domain still matter.

It also creates additional operational complexity if the email provider requires each exact sending subdomain to be verified/configured separately.

Therefore the first implementation should prefer a stable GarageOS sending subdomain unless research at implementation time shows a meaningful deliverability or product advantage to per-shop subdomains.

### Replies

Transactional emails should use a shop-controlled `Reply-To` whenever the shop has an email address capable of receiving replies.

A message can therefore be sent through GarageOS infrastructure while replies still go directly to the shop.

Longer term, GarageOS may optionally receive inbound email and place replies in a unified Messages inbox. That is a separate feature and should not be required for V1.

## 4. Custom domain as an upgrade / professional feature

Shops that own a domain should eventually be able to send using their own branded sender, for example:

```text
service@garage-tremblay.ca
```

or preferably a dedicated transactional subdomain such as:

```text
notifications@mail.garage-tremblay.ca
```

The GarageOS UI should guide the shop through DNS verification (SPF/DKIM and, where appropriate, DMARC) and show states such as:

- Not configured
- DNS records required
- Verifying
- Verified
- Failed / action required

This should be optional. A nontechnical garage owner should be able to use GarageOS without understanding DNS.

Potential future tiers:

- Managed GarageOS sender included
- Custom domain included in a higher tier
- Bring-your-own-provider / BYOK only for advanced or enterprise customers if demand exists

Do not make BYOK the default onboarding experience.

## 5. Email provider architecture

Resend is the preferred current transport provider, but provider-specific logic should be kept behind a small adapter/service boundary so we are not forced to rewrite business workflows if the provider changes.

For multi-tenant sending there are two broad models:

### A. GarageOS-managed account

GarageOS controls the Resend account and sending infrastructure.

Advantages:

- Very low onboarding friction
- Garage owners never see API keys
- GarageOS controls billing and usage
- Easier to bundle communications into subscriptions

Risks:

- Aggregate rate limits
- Shared provider/account reputation
- One abusive tenant can affect the account
- Requires GarageOS-side usage and abuse controls

This is the recommended default model for normal GarageOS customers.

### B. Shop-owned account / BYOK

A shop connects its own provider account/API key.

Potential advantages:

- Independent reputation and billing
- Useful for large customers with existing infrastructure

Disadvantages:

- Bad onboarding for the typical independent garage
- More support burden
- Credentials/secrets management

Treat this as a future advanced/enterprise feature unless there is a concrete customer requirement.

## 6. SMS provider architecture

Twilio is the preferred current provider.

GarageOS is an ISV: we send messages on behalf of independent businesses. The target architecture should therefore consider a **Twilio subaccount per shop** with one or more Messaging Services / phone numbers associated with that shop.

Conceptually:

```text
GarageOS Twilio parent account
│
├── Shop A subaccount
│   └── Messaging Service / number(s)
│
├── Shop B subaccount
│   └── Messaging Service / number(s)
│
└── Shop C subaccount
    └── Messaging Service / number(s)
```

Benefits:

- Usage can be attributed to a shop
- Better operational isolation
- Easier abuse/compliance containment
- Future ability to give a shop its own texting number
- Natural path toward two-way messaging

Do not provision expensive provider resources during ordinary page loads. Provisioning should happen intentionally during onboarding/feature activation and be retryable/idempotent.

Regulatory requirements depend on country, sender type, and use case. The implementation must not hardcode US-only A2P assumptions into Canadian shops; build provider/compliance metadata so region-specific onboarding can evolve.

## 7. Communication concepts

The following are conceptual models, not mandatory Prisma names. Before changing the schema, inspect existing fields/models and avoid duplicating information that can be normalized safely.

### CommunicationTemplate

Shop-scoped editable template.

Possible data:

```text
id
shopId
channel              EMAIL | SMS
key                   APPOINTMENT_CONFIRMATION | APPOINTMENT_REMINDER | ...
language              FR | EN | ES
subject               nullable for SMS
body
isEnabled
isSystemDefault / overriddenFrom
createdAt
updatedAt
```

Templates should support controlled variables, not arbitrary code.

Examples:

```text
{{customer.firstName}}
{{shop.name}}
{{vehicle.year}}
{{vehicle.make}}
{{vehicle.model}}
{{appointment.startsAt}}
{{quote.number}}
{{invoice.number}}
{{invoice.total}}
{{document.url}}
```

Use a whitelist per template/event. Unknown variables should fail validation before saving/sending.

### CommunicationAutomation / NotificationRule

Shop-level rules controlling what gets sent and when.

Example:

```text
APPOINTMENT_CREATED
  → email immediately
  → SMS immediately

APPOINTMENT_STARTS
  → SMS 24 hours before

QUOTE_SENT
  → email quote

WORK_ORDER_STATUS_CHANGED = READY
  → SMS customer

INVOICE_ISSUED
  → email PDF / secure link

INVOICE_OVERDUE
  → email after configured delay

SERVICE_REMINDER_DUE
  → email and/or SMS
```

Prefer known product events/triggers rather than a generic arbitrary workflow engine in V1.

### CommunicationMessage / Outbox

Every attempted outbound message should have a GarageOS-side record.

Potential fields:

```text
id
shopId
clientId?
channel
messageType
status              QUEUED | SENDING | SENT | DELIVERED | FAILED | BOUNCED | ...
provider
providerMessageId?
from
to
replyTo?
subject?
templateId?
renderedBody or immutable render snapshot
businessEntityType?
businessEntityId?
idempotencyKey
scheduledFor?
sentAt?
deliveredAt?
failedAt?
errorCode?
errorMessage?
createdAt
```

This record should make communication history observable from GarageOS even if the provider dashboard is unavailable.

Sensitive content retention needs to be deliberate. Do not retain more message content than required without considering privacy/security implications.

### CommunicationUsage / UsageLedger

Track billable/provider usage separately from business document state.

Possible fields:

```text
shopId
messageId
channel
provider
units                 email=1, sms=segments or provider billing unit
providerCost?
customerBillableUnits?
period
createdAt
```

Money values should use decimals / smallest currency units consistently; never floating point.

## 8. Event-driven behavior

Business actions should emit/domain-trigger communication intentionally.

Examples:

```text
AppointmentCreated
AppointmentRescheduled
AppointmentCancelled
AppointmentReminderDue
QuoteSent
QuoteAccepted
QuoteRejected
WorkOrderStatusChanged
InvoiceIssued
InvoicePaid
InvoiceOverdue
ServiceReminderDue
```

Do not allow a provider API failure to corrupt the underlying business transaction.

Example: creating an invoice must not roll back merely because Resend is temporarily unavailable.

Preferred pattern:

1. Persist business change.
2. Persist communication/outbox intent atomically where practical.
3. Process the message independently.
4. Record provider result.
5. Retry transient failures safely using idempotency.

The repository roadmap already mentions an outbox direction; any implementation should reconcile with that work rather than create a parallel mechanism.

## 9. Documents: invoices, quotes, receipts

An invoice/quote is a GarageOS business entity/document. Email and SMS are delivery channels.

Do not model an invoice as "an email attachment that was sent".

Desired flow:

```text
Invoice created/finalized
    ↓
GarageOS persists invoice and immutable/appropriate document representation
    ↓
PDF and/or secure customer URL becomes available
    ↓
Communication event is queued
    ↓
Email/SMS delivers link or attachment
```

The customer should still be able to access the document from GarageOS even if delivery fails.

For sensitive documents, prefer authenticated or expiring/tokenized access over permanently public storage URLs.

## 10. Templates and branding

Each shop should eventually control communication appearance within safe limits:

- Shop name
- Logo
- Contact information
- Default language
- Email accent/branding where applicable
- Signature/footer
- Per-event template text
- Enable/disable email and SMS by event
- Reminder timing

GarageOS should ship high-quality FR/EN defaults so a garage can activate the product without writing templates.

ES can remain supported where the existing product already supports it.

Template customization should not let a tenant inject executable HTML/JS or unsafe markup.

## 11. Consent, preferences, unsubscribe, and compliance

GarageOS must distinguish **transactional/service communication** from **marketing communication**.

Do not turn this feature into a bulk cold-marketing engine.

Customer/contact records may eventually need fields or related records representing:

```text
emailTransactionalAllowed / applicable legal basis
smsTransactionalAllowed / applicable legal basis
marketingEmailConsent
marketingSmsConsent
consentSource
consentAt
optOutAt
preferredLanguage
preferredChannels
```

Exact legal semantics must be designed against the jurisdictions GarageOS supports; do not treat the example field names above as legal conclusions.

Provider STOP/START/unsubscribe events must be synchronized back to GarageOS where applicable so the application does not continually attempt to message an opted-out number/address.

Marketing/newsletter messaging should remain separate from critical transactional flows and may use a specialized provider/product rather than sharing the transactional pipeline.

## 12. Two-way communications / Messages inbox — future direction

A strong future differentiator is a Messages area where the shop can see conversations with customers.

Example:

```text
Garage → "Your Civic is ready for pickup."
Customer → "Can I come at 5?"
Garage → "Yes, no problem."
```

This likely requires:

- Dedicated/inbound-capable SMS numbers
- Provider inbound webhooks
- Conversation/thread model
- Staff permissions
- Read/unread state
- Attachments later
- Audit trail

Do not make this a dependency for transactional notification V1. Architect identifiers/webhooks so it can be added without replacing the outbound system.

## 13. GarageOS platform notifications vs. shop-to-customer communication

These are separate concerns.

### GarageOS → Garage user

Examples:

- Welcome / account verification
- Password/security notifications
- Subscription/billing alerts
- Trial expiration
- Platform incidents

These should come from GarageOS branding/domains.

### Shop → Shop customer

Examples:

- Appointment confirmation
- Estimate/quote
- Vehicle ready
- Invoice
- Service reminder

These should display the shop identity and use the shop communication configuration.

Do not mix these two sender identities, templates, unsubscribe preferences, or usage accounting.

## 14. Product / business model

Communications should be a product feature and a usage lever, not merely an infrastructure expense hidden from us.

Recommended model:

### Email

Transactional email is inexpensive enough that a generous included allowance can be bundled into most paid plans.

Example product framing (numbers intentionally TBD):

```text
Starter
- Core transactional email included
- GarageOS managed sender
- Limited SMS allowance

Pro
- Larger SMS allowance
- Custom email templates
- More automation rules
- Custom sending domain

Business
- Higher allowances
- Multiple locations when product supports them
- Advanced inbox / messaging
- Advanced reporting
- API/integration capabilities
```

Do **not** commit pricing from this document. Pricing should use current provider costs, target gross margin, observed garage usage, and competitor/customer research.

### SMS

SMS has meaningful variable cost and should be metered.

Good options:

1. Include a monthly SMS allowance per subscription and charge overage.
2. Sell SMS credit packs.
3. Include different allowances by plan.

Avoid "unlimited SMS" unless actual usage economics prove it safe.

The UI should show usage before a shop unexpectedly hits a limit.

### Custom domain

Custom branded sending can be a Pro/Business differentiator because it has clear perceived value without blocking basic customers.

### Dedicated texting number / two-way inbox

This can become an add-on or higher-tier feature because it has recurring provider cost and strong business value.

## 15. Entitlements and quotas

Do not scatter plan checks throughout unrelated business code.

Create/extend a central entitlement layer capable of answering questions such as:

```text
canSendEmail(shop)
canSendSms(shop)
canUseCustomDomain(shop)
canEditTemplates(shop)
canCreateAutomation(shop)
monthlySmsAllowance(shop)
monthlyEmailAllowance(shop)
canUseTwoWayMessaging(shop)
```

Exact API naming is up to the implementation.

Message sending should evaluate both:

- Functional permission (user/shop authorization)
- Product entitlement/quota

System-critical account/security messages must not accidentally be blocked by a shop's customer-SMS quota because platform notifications are a separate channel/domain.

## 16. Abuse and deliverability protection

Because managed sending means GarageOS shares infrastructure risk with tenants, add safeguards before exposing arbitrary sending broadly:

- Per-shop rate limits
- Per-recipient throttling where appropriate
- Bounce/complaint handling
- Suppression list handling
- Hard block after repeated failures
- Tenant usage monitoring
- No arbitrary bulk recipient upload + blast in transactional UI
- Message type restrictions
- Audit logs for manual sends
- Provider webhook verification
- Idempotency

Consider an internal risk/health state for shop communications so one problematic tenant can be paused without disabling all GarageOS communication.

## 17. Recommended staged delivery

This ordering is directional. Reconcile it with `docs/roadmap.md`, `docs/domain-model.md`, and current feature priorities before implementation.

### Phase 0 — prerequisites

- Confirm tenant isolation is safe.
- Audit every existing email/SMS call.
- Audit current Resend/Twilio env/config assumptions.
- Decide GarageOS transactional sending domain.
- Preserve existing user-visible behavior during refactor.

### Phase 1 — normalize outbound communications

- Central provider adapters/services.
- Shop-scoped message/outbox history.
- Consistent template rendering.
- Reliable webhook/status processing.
- Idempotent retries.
- Existing invoice/quote/appointment/reminder sends migrated incrementally.

### Phase 2 — shop configuration + templates

- Communication settings UI.
- Managed GarageOS sender by default.
- Editable templates with system defaults.
- Channel toggles and reminder settings.
- Per-shop usage dashboard.

### Phase 3 — automation rules

- Known event triggers.
- Immediate and scheduled actions.
- Retry/error visibility.
- Guardrails against duplicate sends.

### Phase 4 — custom domain

- Provider API integration for domain creation/verification.
- DNS instructions/status UI.
- Safe fallback to GarageOS managed sender.

### Phase 5 — richer SMS

- Subaccount provisioning strategy.
- Dedicated shop numbers where justified.
- Compliance onboarding by jurisdiction/use case.
- Better usage/billing integration.

### Phase 6 — unified inbox

- Inbound SMS.
- Conversation threads.
- Team workflow/read state.
- Inbound email only if product demand justifies it.

## 18. Implementation questions Claude should answer from the current repo

Before coding this feature, inspect the current implementation and document/resolve:

1. Where are all Resend calls today?
2. Where are all Twilio calls today?
3. Which sends occur inside Server Actions or request transactions?
4. What existing email template components can be reused?
5. How does `email-config.ts` currently resolve `From` addresses, and can it produce an unverified shop domain that Resend will reject?
6. Which `Shop` email fields are meant for inbound contact vs. outbound sender identity?
7. Which existing `Invoice`, `Quote`, `Appointment`, and `ServiceReminder` fields should be replaced, retained, or derived once a message history exists?
8. Does the current tenant authorization guarantee every referenced client/document belongs to the same shop?
9. How are cron/scheduled reminders executed today?
10. How are provider webhook signatures validated today, if at all?
11. What data is currently persisted after an email/SMS fails?
12. What code assumes one global sender/phone number?
13. What should remain synchronous for UX, and what must move to an outbox/job mechanism?
14. What tests are required to prove no cross-shop sending or template access is possible?
15. What is the smallest migration path that does not break existing appointment/invoice workflows?

The output of that audit should drive the concrete implementation plan.

## 19. Non-goals / guardrails

For the first implementation, avoid turning this into:

- A generic Zapier clone
- A full marketing automation suite
- A cold outreach platform
- A general email hosting product
- A complete CRM inbox before reliable transactional messaging exists
- A mandatory DNS setup step for every garage
- A requirement that every garage create Resend/Twilio accounts

The primary job is simple:

> When something important happens in the garage workflow, GarageOS should reliably send the right message, in the customer's language, with the garage's identity, through the correct channel, while keeping tenant data isolated and the cost/usage observable.

## 20. External implementation notes to re-verify when building

These were current when this reference was written and should be checked again before implementation because provider requirements can change:

- Resend recommends sending from subdomains to isolate sending reputation/purpose.
- Resend supports multi-tenant SaaS patterns using a single GarageOS account with tenant domains, or separate tenant-owned accounts/BYOK; the single-account model shares account reputation and aggregate limits.
- Resend requires the `From` domain to match a verified sending domain.
- Twilio recommends ISVs isolate customers using subaccounts and Messaging Services.
- US A2P 10DLC has additional registration requirements; Canadian messaging requirements and sender options must be evaluated separately rather than inferred from US rules.
- Canadian email/SMS communication must be designed with applicable consent/identification/unsubscribe obligations in mind; distinguish operational/transactional messaging from marketing.

Re-verify official provider and regulatory documentation before shipping, especially pricing, limits, sender registration, and compliance behavior.
