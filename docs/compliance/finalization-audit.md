# GarageOS compliance finalization audit

Date: 2026-09-29 (storage 2026-09-30; provider/cross-border/backup review 2026-09-30)

## Verified in code
- Campaign audience resolution requires `marketingEmailConsent=true`, no email marketing opt-out, and an email address.
- Campaign cron re-checks consent/opt-out and the suppression table immediately before each send.
- Campaign email includes a signed unsubscribe URL. Unsubscribe clears marketing consent, records opt-out time and adds an email suppression.
- Inbound SMS STOP adds SMS suppression and clears SMS marketing consent. START removes only the STOP/UNSUBSCRIBE suppression and does not recreate marketing consent.
- Public-site analytics are first-party and cookie-free. The analytics record does not store raw IP; it stores a daily one-way visitor hash plus page/referrer/UTM/device/browser/country data.
- Communications attachments use a private Supabase bucket with expiring signed URLs.
- Storage is split by classification (`src/lib/storage.ts`, `docs/compliance/storage-privacy.md`): public `public-assets` bucket only for shop logos and booking-page images; private `accounting` bucket for invoices, payment receipts, accounting documents and DVI photos; private `communications` bucket for Inbox attachments. Private helpers require the `shopId`, reject any path not under `{shopId}/` (traversal-safe) and issue only server-side downloads or short-lived signed URLs after authorization. The DB stores paths, not URLs. Covered by `tests/storage-privacy.test.ts`.
- Current public Privacy and Terms pages are bilingual.

## Gaps / actions
### P1 before first paying customer
1. **Storage classification — code done, one operator step left.** Verified in the connected Supabase project (2026-09-30): the legacy `accounting` bucket is still **public** and holds 5 demo/test objects (3 invoice-share PDFs, 2 logos); `public-assets` (public, image MIME types, 5 MB limit) was created. The `accounting` bucket must be flipped to private by running `scripts/migrate-storage-privacy.ts` (dry-run, `--apply`, then `--apply --finalize`) right after the release deploys; until then private uploads fail closed by design. Existing private objects keep their paths (no move needed). Tracked in the PR runbook.
2. **Provider/cross-border EFVP:** complete the provider register with actual production regions, contracting entities, contractual safeguards, deletion/return and incident terms for Vercel/application hosting, database/storage/Supabase, Stripe, Twilio, Resend, Pusher and Intuit/QBO. The Law 25 transfer assessment cannot be marked complete from code alone.
3. **Retention:** statutory accounting/tax retention periods still to be confirmed. Backups: the Supabase connector reports the organization on the **Free plan**, and does not expose backup/PITR settings, so backup retention is **not verified**; confirm in the dashboard (Project → Database → Backups) and upgrade the plan if production needs managed backups. Storage objects are not part of Supabase database backups.
4. **Business identity:** confirm the legal contracting name/status and business mailing address to use in Terms/notices/invoices. Do not invent NEQ or tax-registration numbers.
5. **Operational incident readiness:** keep the incident register accessible to the Privacy Officer and run one tabletop exercise.

### Provider / cross-border / backup review (2026-09-30) — results
Not closed; see `privacy-impact-assessment.md` §7 for the classified list. Highlights: **application DB host unidentified** (not the connected Supabase project); all verified destinations are in the **USA** (Vercel iad1, Supabase us-east-1, Pusher us2, Twilio US1 default, Resend US, Stripe US); Supabase org on **Free plan** with **no backups** and no backup of Storage objects; **Preview deployments share the production database and provider keys**; Telegram alert no longer carries support-message text (fixed); QuickBooks and AI providers confirmed **not active** in Production.

### P2 before enabling marketing campaigns for customers
6. **Consent evidence workflow:** the current staff toggle records source=`manual` and timestamp. The shop must only turn it on when it has a valid consent/basis it can substantiate. Product copy should make that explicit; a future enhancement can record method/evidence/notes.
7. Run an end-to-end unsubscribe test through a real delivered campaign and a real STOP/START SMS test.
8. Verify sender-identification/footer content against the actual shop identity and mailing/contact information used in production templates.

### No cookie banner required by the current implementation solely for this analytics
The current analytics implementation is first-party and cookie-free and does not load a third-party analytics/advertising script. The Privacy Policy now discloses this measurement. Reassess before adding pixels, ad-tech, third-party analytics, fingerprinting, or non-essential cookies.

## Change-control rule
Any new provider, personal-data category, cross-border flow, tracking technology, marketing channel, automated-decision feature, or material system redesign reopens the PIA/EFVP and public-disclosure review before release.
