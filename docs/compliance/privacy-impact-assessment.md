# GarageOS privacy impact assessment (PIA / EFVP) — initial working record

Date: 2026-09-29 · provider/cross-border assessment updated 2026-09-30
Owner: Privacy Officer

## Project
GarageOS is a multi-tenant B2B SaaS for independent automotive shops. It handles shop staff accounts and shop-entered records relating to customers, vehicles, appointments, estimates, work orders, inspections/photos, invoices/payments, communications, reminders, tire storage, imports, customer portal activity and optional integrations.

## Necessity and purposes
The core data categories support identifiable shop-management workflows. New categories should not be collected merely because they may be useful later. Direct-cost communications and integrations are activated for service delivery or shop-selected workflows.

### Sales Demo Wave 1 (2026-10-01)
Purpose: a platform salesperson prepares a prospect's real Shop for an in-person product demonstration. The dedicated SalesDemo record stores optional contact name/email/phone, preferred language, Sales actor id, tier/lifecycle choices and timestamps. Only shop name is required. No prospect login, password, card, activation token or commercial subscription is created in this wave. Server authorization checks the real SUPER_ADMIN account even during impersonation; tenant users cannot manage demos or gain the demo entitlement override. Demo access expires after 30 days and impersonation after at most one hour, rechecked on every request.

Logo, storefront and interior uploads are explicitly public business brand assets, using the existing Supabase public-assets classification and tenant-scoped paths. The UI explains this classification; optional images can be skipped. Decoding/type/size/pixel limits, EXIF removal and normalized output apply to uploads. Immutable demo logo versions prevent a late upload overwriting a live asset after a lifecycle change. The optional ChatGPT helper only copies a prompt; GarageOS does not transfer images or prospect information to an AI service. The salesperson decides whether to attach a logo externally. No new app provider or integration is introduced; existing database/hosting/storage transfer-assessment gaps remain unchanged. Wave 1 suspends communications using the existing Shop flag; operational sending and its durable billing exclusion are deferred to Wave 2.

Residual gap and owner: Sales/platform operations and the Privacy Officer must review expired/unconverted leads and unreferenced asset versions for manual retention/destruction. Access expiry is not deletion. Automated cleanup is deferred; deleting a SalesDemo must never delete its associated Shop, especially a converted Shop. See retention-destruction.md. No Terms, CASL matrix or provider-register changes are introduced by this preparation-only wave; prospect-data/public-asset disclosure and the final retention policy must be reviewed before operational rollout.

### Sales Demo Wave 2 (2026-10-01)
Sales explicitly enables real transactional communications for a live authorized demo, then uses the existing communication controls, sender identities, providers, suppression and delivery records. The global provider gate remains mandatory; background jobs cannot gain Sales impersonation privileges. CommunicationMessage carries durable demo provenance for permanent SMS billing exclusion, including fallback/retry after conversion or deletion. This provenance is retained with communication history and is not removed by Restart. Synthetic scenario records have an explicit batch identity, no contact recipients and no automatic sends. Restart preserves live-entered records and preparation; optional removal is restricted to the synthetic batch, with confirmation and transactional refusal when linked to financial/approval/live data. Existing Terms/CASL/provider-register requirements still apply.

## Principal privacy risks and current mitigations
- Cross-tenant disclosure: tenant ownership checks, role/access controls and attack tests.
- Excessive internal access: role/permission controls and least-privilege policy.
- Public endpoint abuse: authentication/authorization and rate limiting where appropriate.
- Messaging misuse: suppression/STOP and CASL review required.
- Provider/cross-border processing: provider inventory, contractual safeguards and transfer assessment required.
- Account compromise: authentication, rate limiting and security logging.
- Data persistence after termination: retention/export/deletion schedule must be finalized.
- Incident response: documented procedure and register required.
- Imports: shop must have authority to import data; imported data receives the same access controls.

## File storage (updated 2026-09-30)
Files are classified at write time. Public: shop logos and booking-page images only (public bucket, no customer data). Private: invoices, payment receipts, accounting documents, DVI/inspection photos and Inbox attachments (private buckets; tenant-scoped paths; access only via server-side download or short-lived signed URLs after shop/customer-token authorization; DB stores paths). Shared DVI reports serve photos through a token-checked redirect (60 s). Storage location: Supabase us-east-1 (USA) — a transfer outside Quebec that must be covered by the transfer assessment below.

## Status of this assessment (2026-09-30)
**Not complete.** The document below is a real assessment of the flows we could verify, but it cannot be closed while (a) the Neon database plan, backups and contract are unverified (provider and region are owner-confirmed: Neon PostgreSQL, AWS us-east-2), (b) provider agreements have not been accepted/reviewed by GarageOS, and (c) the decisions in §7 are open. It is an internal working record prepared with engineering tooling, not legal advice; counsel should confirm the legal conclusions.

## Legal framework applied (sources to re-open; primary texts were not opened in this environment)
- Quebec *Act respecting the protection of personal information in the private sector* (CQLR c. P-39.1), https://www.legisquebec.gouv.qc.ca/fr/document/lc/p-39.1. As understood by the reviewer: **s. 17** — before communicating personal information outside Québec the enterprise must assess privacy-related factors (sensitivity, purposes, protection measures incl. contractual, and the legal framework of the destination) and may communicate only if the information would receive adequate protection, under a written agreement reflecting the assessment; **s. 3.3** — assessment for projects to acquire/develop/overhaul systems handling personal information; **s. 18.3** — written service-provider contracts with protective measures and incident notice; **ss. 3.5–3.8** — confidentiality-incident handling (already in `incident-response.md`). Exact wording and current in-force text: verify on Légis Québec.
- Commission d'accès à l'information (CAI): EFVP guide https://www.cai.gouv.qc.ca/uploads/pdfs/CAI_GU_EFVP.pdf and page on communications outside Québec https://cai.gouv.qc.ca/evaluation-facteurs-relatifs-vie-privee/communication-renseignements-personnels-exterieur-quebec.
- Federal (PIPEDA, interprovincial/international commercial activity): OPC guidance on processing across borders https://www.priv.gc.ca/en/privacy-topics/airports-and-borders/gl_dab_090127/ — transfers for processing are permitted; the organization stays accountable and must use contractual or other means to provide a comparable level of protection (Principle 4.1.3); the OPC position is that consent/notice obligations still apply, i.e. the transfer must be transparent (the public Privacy Policy already discloses processing outside Québec/Canada).
- Foreign-jurisdiction exposure: all verified destinations are the **United States**. Reviewer-level observation (not a legal conclusion): US providers are subject to US lawful-access regimes (e.g. subpoenas/warrants, FISA 702 for electronic-communications providers), and US law contains no general privacy statute equivalent to Law 25; this weighs on sensitive data volumes, not on low-sensitivity operational metadata. Counsel should decide whether to rely on provider DPAs/SCCs plus encryption as sufficient "adequate protection".

## Data-flow inventory (verified from repo + infrastructure)
See `subprocessors.md` for provider-by-provider facts and evidence levels. Summary of personal-information flows in Production:
| # | Flow | Data | Subjects | Leaves Québec/Canada? |
|---|---|---|---|---|
| 1 | Browser → Vercel (iad1) | all app traffic | shop staff, shop customers (portal/booking/report links) | **Yes (USA)** |
| 2 | App → application PostgreSQL (Neon) | all records | all | **Yes — Neon on AWS us-east-2 (Ohio, USA), owner-confirmed 2026-09-30** |
| 3 | App → Supabase Storage (us-east-1) | invoices, receipts, accounting docs, DVI photos, Inbox attachments (private); logos/booking photos (public) | end customers (financial/vehicle), shop | **Yes (USA)** |
| 4 | App → Stripe | shop owner name/email/shop id | shop owners only | **Yes (USA)** |
| 5 | App → Twilio | end-customer phone + SMS body | end customers | **Yes (US1 default)** |
| 6 | App → Resend | recipient email/name + email content/attachments | end customers, staff | **Yes (USA, stored in USA)** |
| 7 | App → Pusher (us2) | support-chat text, conversation ids, staff in-app notification title/body (client name, service, time) | shop staff, end-customer names | **Yes (USA)** |
| 8 | Google OAuth | login of staff | shop staff | Google-controlled |
| 9 | App → Telegram | shop name + link (post-fix) | none (business name) | Telegram data centers |
Not active: Intuit QBO, any AI provider (see register).

## Risk assessment of material cross-border flows
Method: qualitative; no numerical scores. "Residual" is the risk after existing safeguards.

**Flow 3 — Supabase Storage (USA).** Sensitivity: **medium-high** (invoices/payment receipts reveal name, address, vehicle, amounts; DVI photos may show plates/vehicles; Inbox attachments are arbitrary customer documents). Necessity: files must be stored to deliver the service; no in-Québec alternative is configured. Volume: grows with customers; zero real customers today (5 demo objects). Safeguards: private buckets, tenant-scoped paths, server-issued short-lived signed URLs, DB stores paths only, migration/flip runbook (`storage-privacy.md`), AES-256 at rest/TLS (DOC), SOC 2 Type 2 (DOC). Gaps: DPA acceptance on Free plan unverified; no independent backup of objects; region is USA. Residual: **medium**. Decision needed: accept US storage with DPA + encryption, or move the project to `ca-central-1` (Supabase offers it) **before real customers** — cheapest at zero data.

**Flow 2 — Application database (Neon).** Sensitivity: **high** in aggregate (all customer, vehicle, invoice and message records). Provider and region were first indicated by the datasource line in Vercel build logs and then **confirmed by the owner (2026-09-30): Neon PostgreSQL on AWS us-east-2 (Ohio, USA)**. Necessity: core. Safeguards: TLS (`sslmode` in the URL), tenant authorization tests; **not verified**: Neon plan, backups/PITR, encryption-at-rest statement, DPA/sub-processors, access controls on the Neon console. Residual: **cannot be rated until the Neon facts are collected**; same residency decision as Flow 3.

**Flow 1 — Vercel iad1.** Sensitivity: high in transit (all data passes through functions), low at rest (no persistent storage except logs). Necessity: hosting. Safeguards: TLS, DPA (DOC), no personal data intentionally logged (this review removed email addresses from two log lines; error logs may still carry Prisma error text — post-launch log review). Function region can be moved to a Canadian region only if Vercel offers one on our plan (NV: `yul1` exists in Vercel's sandbox region list, function availability not verified). Residual: **medium**; acceptable with DPA if the database stays in-country, otherwise bounded by the DB decision (data crosses the border in transit regardless).

**Flow 5 — Twilio SMS.** Sensitivity: low-medium (phone + short operational text; invoice URL is a bearer link). Necessity: core reminder/notification feature; SMS inherently traverses carriers. Safeguards: STOP/suppression handling, per-shop subaccounts, DPA (DOC). Gaps: invoice/quote download links are non-expiring bearer tokens (see actions). Residual: **low-medium**, acceptable at launch.

**Flow 6 — Resend.** Sensitivity: medium (invoice PDFs/attachments can be emailed). Necessity: core. Safeguards: DPA + SCC/DPF (DOC), suppression list, private links preferred. Stored in USA irrespective of sending region (DOC) so region selection does not help. Residual: **medium**, acceptable with DPA.

**Flow 7 — Pusher us2 (investigated in depth 2026-09-30).** Channels found in code and what crossed them **before this PR** (all *public*, no server auth; pusher-js needed only the public app key + a channel name):
- `platform-conversation-{conversationId}` — event `message`: `{id, sender, content, createdAt}` = full support-chat message bodies (shop ↔ GarageOS staff; free text).
- `staff-notifications-{userId}` — event `notification`: `{id, title, body, href, createdAt}`; `body` is built from new-appointment / quote-decision alerts and includes **end-customer name** plus service and time (`src/lib/staff-alerts.ts`); `href` is an internal admin path.
- `platform-messages-admin` — events `conversation-updated {conversationId}` and `pending-changed {}`: metadata only.
Guessability: ids are Prisma `cuid()` (timestamp + counter + random; not designed as secrets) and `conversationId`/`userId` are delivered to the authenticated browser. Public Pusher channels cannot be enumerated with the public key, so exploitation needed a known/guessed id — but nothing enforced tenancy, so **a Shop A user who obtained or guessed a Shop B id could subscribe by changing the channel name and receive its messages/notifications**. Rated a pre-customer security issue and **fixed in this PR**: all three channels are now `private-*`, pusher-js authorizes each subscription through `POST /api/pusher/auth`, which requires a session and allows only: own `private-staff-notifications-{userId}`; `private-platform-conversation-{id}` if the conversation belongs to the session's shop (or SUPER_ADMIN); `private-platform-messages-admin` for SUPER_ADMIN. Unknown/malformed names → 403; unauthenticated → 401. Adversarial tests: `tests/pusher-auth.test.ts` (cross-shop, cross-user, crafted names, non-private names, bad socket ids, signature bound to socket+channel, code guard against public names). Residual after fix: **low** (data still transits Pusher us2; content is business support text and staff notification summaries; Pusher retention NV). Operator follow-up: none required, but a separate Pusher app for Preview is advised (subprocessors.md).

**Flow 4 — Stripe.** Sensitivity: low for privacy (business owner contact + payment handled by Stripe hosted pages; PCI scope minimal). Residual: **low**.

**Flow 9 — Telegram.** Before this review the alert included the shop's free-text support message (could contain customer information) → removed; now business name + link. Residual: **negligible**.

**Flow 8 — Google OAuth.** Staff identity only. Residual: **low**.

## Minimization findings and fixes (this review)
- **Fixed:** Telegram alert no longer contains the support-message body; shop name is HTML-escaped; link is absolute (`tests/provider-minimization.test.ts`).
- **Fixed:** verification-email failure logs no longer print the recipient email address to Vercel logs.
- Checked, no change needed: Stripe payload contains no end-customer data; QBO payload (inactive) is limited to name/email/phone/address, sent only for connected shops; Twilio/Resend content is what the feature requires.
- Logged, not changed (P2): `/api/invoices/download/[token]` links do not expire; invoice PDFs are streamed by the server (not public storage).

## Existing safeguards relied on
Tenant authorization tests (129 cross-tenant attack cases per `docs/launch-readiness.md`), role permissions, private storage with signed access, incident procedure/register, privacy-request procedure, first-party cookie-free analytics, CASL suppression controls.

## 7. Decisions and actions (owner: Privacy Officer)
**BLOCKER — before any real customer**
1. **Neon PostgreSQL on AWS us-east-2** hosts the application database (owner-confirmed). Open the Neon console and record: plan, region, backup/point-in-time-restore window, encryption/DPA, who has console access. Confirm backups exist (see `retention-destruction.md`, `operations-runbook.md`).
2. Decide the data-residency position for Storage and DB: stay in USA with DPAs, or use a Canadian region (`ca-central-1`). Record the decision and reasoning here. Zero real data exists today, so changing region is cheap now and expensive later.
3. Complete the storage privacy migration (`storage-privacy.md`): `accounting` bucket is still public until `scripts/migrate-storage-privacy.ts --apply --finalize` runs.
4. Stop Preview deployments from using the production database. **Proven** (Preview build log): Preview builds ran `migrate resolve/deploy`, the backfill and the super-admin bootstrap against production. Build-time DB steps are now skipped on Preview (this PR); still create a separate Preview database and the Preview variable set in `subprocessors.md` → Environment separation before any further Preview testing.
5. Backups: a plan with actual backups for whichever host holds the DB, and a first restore test (runbook).

**BEFORE PAID LAUNCH**
6. Accept/download the provider DPAs (Supabase, Vercel, Stripe, Twilio, Resend, Pusher) and file them; confirm Supabase DPA applies on the plan used.
7. Legal review of the "adequate protection" conclusion for US processing and of the service-provider clauses in the shop Terms; confirm business identity/address.
8. Confirm Twilio account region and Resend domain region in the provider dashboards; record.
9. Rate-limit and add expiry (or revocation) to invoice download tokens.
10. Tabletop incident exercise; log review for accidental PII in Vercel logs.

**POST-LAUNCH HARDENING**
11. Private (authenticated) Pusher channels. 12. Storage retention/deletion job per record class. 13. Re-run this PIA before enabling QuickBooks, any AI provider, new tracking, or new region/provider. 14. Consider Vercel runtime-log retention and log drain policy.

## 7a. Status update 2026-10-02 (Launch Agent 3)
- Blocker 1 facts now recorded: Neon **Free** plan, project region `aws-us-east-2`, Postgres 18, PITR window 6 h, Production branch protection off; independent daily encrypted off-platform backup exists and was restore-drilled (see `operations-runbook.md`). Neon DPA/sub-processors/console access list: still to be filed by the operator.
- Blocker 2: classified against official sources as a **documented cross-border-transfer/EFVP obligation, not a prohibition** (`legal-verification-2026-10-02.md` §3). The residency *decision record* (stay in the USA with DPAs vs Canadian region) and the "adequate protection" conclusion remain with the Privacy Officer/counsel.
- Blockers 3 (storage privacy migration, completed 2026-09-30), 4 (Preview separation, verified 2026-10-01) and 5 (backups + first restore test) are done.
- Supabase Storage currently holds only test objects and two logos (read 2026-10-02); automated storage backup is prepared and becomes required before real uploads (runbook).
- This assessment stays **"Not complete"** until the operator closes the DPA/legal items; it gates the first paying customer.

## Decisions
Privacy Officer contact is public. Public privacy information is bilingual. French Terms are available in the same technological channel as English. Material new integrations, tracking, automated decisions or new categories of personal information trigger PIA review.

## Open items (superseded by §7 above)
Verify provider regions/contracts; finalize retention periods and backup rotation; verify CASL controls; document production backup/restore; verify any analytics/cookies and determine whether consent UI is required; confirm legal business identity/address details for final legal notices.
