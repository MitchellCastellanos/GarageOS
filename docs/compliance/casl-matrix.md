# CASL communications matrix

## Rule
Do not assume every email/SMS is a commercial electronic message (CEM), and do not assume every operational message is exempt. Classify each message by purpose and facts. For CEMs, ensure a valid consent basis where required, sender identification and a readily performed unsubscribe mechanism; unsubscribe requests must be implemented within the legally required period.

| GarageOS flow | Primary purpose | V1 treatment |
|---|---|---|
| Appointment confirmation/change | Transaction/service relationship | Operational; no promotional content unless separately compliant |
| Estimate/approval request | Transaction/service relationship | Operational; no promotional content unless separately compliant |
| Invoice/payment document | Transaction/service relationship | Operational; no promotional content unless separately compliant |
| Tire-storage check-in/pickup reminder | Existing service | Operational; keep content tied to service |
| Maintenance reminder | May encourage future paid service | REVIEW CASL basis and content before broad launch |
| Marketing campaign | Promote/commercial activity | CEM controls required: consent basis, identification, unsubscribe/suppression |
| GarageOS marketing to prospects | Promote GarageOS | CEM controls required unless a specific CASL exception/basis applies |

## Evidence
For marketing, retain sufficient evidence of consent/basis: address/number, source, date/time, wording or relationship supporting the basis, and withdrawal date. Never re-add a suppressed recipient without a valid basis and appropriate process.

## Product checks before GO
Verify campaign UI cannot send to suppressed recipients; unsubscribe links work end-to-end; SMS STOP is reflected in sending eligibility; sender identification is present; and consent/basis records are adequate for the intended use cases.


## GarageOS Lead Engine and field visits — decision update (2026-10-10)

- The Lead Engine imports and validates business records independently of consent. **A public business email or CSV import is not itself permission to send a commercial electronic message.** Preserve source, capture date, applicable evidence and suppression status.
- A recorded FIELD visit is **not** automatically a CASL basis. Failed contact, unavailable decision maker, closed/invalid business, rejection and DNC must never unlock automated outreach merely because a `FIELD_VISIT` activity exists. A qualifying conversation may satisfy a separate territory engagement gate, but commercial sending still requires valid CASL basis and all other send-policy checks.
- Proposed published-address/other evidence requires structured support and review by an authorized Sales Manager **within their team** or Super Admin **globally**. Reps may not approve their own evidence. Previously self-attested bases must not be silently grandfathered as verified.
- Before real outreach, validate the precise applicable CASL grounds and unsubscribe/identification requirements with qualified counsel; do not treat product policy as legal advice.
- See [GarageOS Lead Engine and Field Planner roadmap](../garageos-lead-engine-field-planner-roadmap.md) for implementation gates. **These rules are approved requirements, not a claim that code has already implemented them.**

## Implementation status — Lead Engine evidence & approval (code, 2026-10-12)
Implemented in the Lead Engine PR (see [lead-engine-contracts.md](../lead-engine-contracts.md)); **not legal advice and not yet live in Production**.
- Published-/disclosed-address bases require structured evidence (type, source URL for published addresses, capture date, supporting facts, role relevance, published-conditions confirmation) and are stored `PENDING_REVIEW`; they authorise nothing until `APPROVED` by a Sales Manager **for their own team** or a Super Admin. Reps cannot approve; nobody but a Super Admin approves their own evidence. Every decision is audited.
- Pre-existing bases are **not modified** by the migration (`reviewStatus` stays `NULL` = legacy, unchanged behaviour, never "verified"). A separate Super Admin procedure (preview → apply → revert, audited) can reclassify them `LEGACY_UNREVIEWED`, after which address-based legacy bases stop authorising sends until fresh evidence is approved.
- Imports never create a basis or an enrollment. Counsel review of the precise CASL grounds remains a launch gate.
