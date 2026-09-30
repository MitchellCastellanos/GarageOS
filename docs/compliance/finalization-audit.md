# GarageOS compliance finalization audit

Date: 2026-09-29

## Verified in code
- Campaign audience resolution requires `marketingEmailConsent=true`, no email marketing opt-out, and an email address.
- Campaign cron re-checks consent/opt-out and the suppression table immediately before each send.
- Campaign email includes a signed unsubscribe URL. Unsubscribe clears marketing consent, records opt-out time and adds an email suppression.
- Inbound SMS STOP adds SMS suppression and clears SMS marketing consent. START removes only the STOP/UNSUBSCRIBE suppression and does not recreate marketing consent.
- Public-site analytics are first-party and cookie-free. The analytics record does not store raw IP; it stores a daily one-way visitor hash plus page/referrer/UTM/device/browser/country data.
- Communications attachments use a private Supabase bucket with expiring signed URLs.
- Current public Privacy and Terms pages are bilingual.

## Gaps / actions
### P1 before first paying customer
1. **Storage classification:** `src/lib/storage.ts` currently uses one public `accounting` bucket for accounting documents as well as intentionally public shop logos/booking images. This conflicts with the new engineering rule. Split public media from private accounting/customer documents and migrate any existing sensitive objects before real customer data is uploaded.
2. **Provider/cross-border EFVP:** complete the provider register with actual production regions, contracting entities, contractual safeguards, deletion/return and incident terms for Vercel/application hosting, database/storage/Supabase, Stripe, Twilio, Resend, Pusher and Intuit/QBO. The Law 25 transfer assessment cannot be marked complete from code alone.
3. **Retention:** confirm the actual database backup retention/rotation and statutory accounting/tax retention periods, then replace the placeholders in `retention-destruction.md`.
4. **Business identity:** confirm the legal contracting name/status and business mailing address to use in Terms/notices/invoices. Do not invent NEQ or tax-registration numbers.
5. **Operational incident readiness:** keep the incident register accessible to the Privacy Officer and run one tabletop exercise.

### P2 before enabling marketing campaigns for customers
6. **Consent evidence workflow:** the current staff toggle records source=`manual` and timestamp. The shop must only turn it on when it has a valid consent/basis it can substantiate. Product copy should make that explicit; a future enhancement can record method/evidence/notes.
7. Run an end-to-end unsubscribe test through a real delivered campaign and a real STOP/START SMS test.
8. Verify sender-identification/footer content against the actual shop identity and mailing/contact information used in production templates.

### No cookie banner required by the current implementation solely for this analytics
The current analytics implementation is first-party and cookie-free and does not load a third-party analytics/advertising script. The Privacy Policy now discloses this measurement. Reassess before adding pixels, ad-tech, third-party analytics, fingerprinting, or non-essential cookies.

## Change-control rule
Any new provider, personal-data category, cross-border flow, tracking technology, marketing channel, automated-decision feature, or material system redesign reopens the PIA/EFVP and public-disclosure review before release.
