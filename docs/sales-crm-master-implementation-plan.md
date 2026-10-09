# GarageOS Sales CRM — Master Implementation Plan

**Status:** Approved product scope; engineering implementation pending.  
**Repository:** `MitchellCastellanos/GarageOS`, `main`.  
**Audience:** Claude implementation agents, maintainers, platform administrator.  
**Execution:** Up to THREE large implementation agents. Do not start production changes before verifying the latest deployment/main state.  
**Rule:** Re-audit current code at agent start; this document describes the inspected baseline, not a substitute for code review.

## 0. Executive mandate

Build a native, production-grade GarageOS **Sales Workspace** for independent auto-repair-shop prospecting, qualification, outreach, replies, calendar booking, guided demos, owner activation and Stripe-confirmed conversion. Super Admin creates and manages sales staff, sender identities, assignments, training, playbooks and performance. Sales users have limited platform authorization, NEVER tenant-owner powers over paying customers.

Sales process: **source/import lead → research → qualify & language → assign → outreach → reply → meeting → tailored demo → objections & follow-up → activation → Stripe-confirmed Won → customer handoff**.

Core principles:
- Prospect records are **not Shop records**; create a temporary Shop only through the existing SalesDemo lifecycle.
- Platform staff authorization is distinct from tenant `Role` and `/admin` permissions. Never add `SALES` to tenant Role.
- Separate **commercial stage**, **demo technical status**, **email delivery**, **meeting status**, **subscription state**.
- Commercial messaging is separate from shop customer communication and platform support, though safe shared primitives may be reused.
- FR/EN end-to-end, including all emails, calendar pages, demo playbooks and public booking; responsive at 390px/tablet/desktop.
- No fake integrations or success states; unavailable provider capability must be surfaced honestly and gated.

## 1. Repository baseline verified October 8, 2026

Existing:
- `src/app/platform/layout.tsx` invokes `requireSuperAdmin()` and renders `PlatformChrome`; it currently blocks all non-SUPER_ADMIN users.
- `src/lib/permissions.ts` defines `requireSuperAdmin`, `requireOwner`, `requireShopSession`.
- `src/lib/sales-demo.ts`: `requireSalesActor()` and `authorizedDemoSession()` currently check real actor's `SUPER_ADMIN` role. Comments explicitly direct future sales permissions here, **not tenant Role**.
- `src/app/platform/sales/page.tsx` lists up to 100 `SalesDemo` records, not CRM leads. `/platform/sales/new` and `/platform/sales/[id]` prepare demos.
- `src/actions/sales-demo.ts` creates prospect demo Shop/Subscription/SalesDemo, impersonates safely, changes demo tier, uploads assets.
- `src/actions/sales-demo-conversion.ts` and `src/lib/sales-demo-conversion.ts` handle secure owner activation, email and Stripe handoff.
- `src/components/admin/PlatformChrome.tsx`, `AdminSidebar.tsx`, `src/lib/routes.ts` need platform-role-aware navigation.
- `src/app/platform/messages/page.tsx`, `src/actions/platform-messages.ts`, `PlatformConversation`/`PlatformMessage` are platform **support conversations** with shops, not prospect email. Keep separate.
- `prisma/schema.prisma` contains `User`, `Role`, `SalesDemo`, `Shop`, `Subscription`, `PlatformAuditLog`, `PlatformConversation`, `CommunicationThread`, `CommunicationMessage`, `SenderIdentity`, `Campaign`, `Appointment`, etc.; **no dedicated CRM prospect/opportunity/staff models** in inspected schema.
- `src/lib/email-config.ts` routes tenant transactional channels `INVOICE`, `QUOTE`, `APPOINTMENT`, `REMINDER`, `WORK_ORDER`, `WEB_CONTACT`. Do not casually add platform SALES to shop routing; implement an explicit platform-sales sender service.
- Resend, Pusher, Stripe, Next.js, Prisma and React Email already exist. `docs/communications-platform.md`, `docs/sales-demo-implementation-plan.md`, `docs/platform-super-admin.md` are reference documents.
- `package.json` scripts include `db:validate`, `typecheck`, `lint`, `test`, `build`; build invokes migration deployment. Never run production-affecting migration/build without understanding environment and approval.

At implementation time inspect actual webhook routes, auth callbacks, session shape, Prisma relations/indexes, outbox/cron architecture, public routes, Resend inbound capability, provider settings, audit conventions and existing tests. These are not fully verified by this plan.

## 2. Information architecture

`/platform`: existing Super Admin platform overview, shops, analytics, support.
`/platform/sales`: sales dashboard for authorized sales actors; global scope for Super Admin.
`/platform/sales/prospects`, `/platform/sales/prospects/[id]`: searchable list/detail.
`/platform/sales/pipeline`: stage board and table alternative.
`/platform/sales/inbox`, `/platform/sales/inbox/[threadId]`: sales email.
`/platform/sales/outreach`: templates, sequences, enrollments and compliance.
`/platform/sales/calendar`: events, availability, booking settings.
`/platform/sales/tasks`: follow-ups and activities.
`/platform/sales/demos`: existing demo list migrated here with compatibility redirects.
`/platform/sales/academy`: playbook training.
`/platform/sales/performance`: seller's own metrics.
`/platform/sales/team`, `/platform/sales/team/[staffId]`: Super Admin/authorized manager team management.
`/platform/sales/settings`: identities, approved templates, playbooks, business hours and controls, access-gated.
`/sales/book/[opaqueToken]`: public FR/EN meeting booking, safe opaque token; choose final public URL after routing audit.

All paths are proposals; keep existing `/platform/sales/new` and `/platform/sales/[id]` deep links operational or redirect safely. Avoid `[id]` route collisions with new literal segments.

## 3. Authorization and staff lifecycle

Implement a **platform-level staff membership/permission layer** linked to existing User, not tenant Role. SUPER_ADMIN remains privileged, sales reps do not acquire tenant privileges. Roles: `SALES_REP`, `SALES_MANAGER`, with explicit permission capabilities (read_assigned_prospects, read_team_prospects, manage_prospects, manage_team, send_sales_email, manage_sequences, manage_sender_identities, manage_playbooks, prepare_demo, view_team_reporting). Use server-side permission and record-scope checks on **every** page loader, action, API, webhook side-effect and Pusher authorization. Do not rely on hidden UI.

Super Admin staff flow: create/invite with verified identity → configure access and scope → configure approved sender identity/signature → schedule and territory → assign leads → activate. Edit name/title/phone/signature/language/timezone/availability/role/status; disable/revoke sessions and send privileges; preserve historical attribution; safely reassign open prospects, inbox threads, tasks and meetings. Email ownership must be verified; no arbitrary spoofing. Log creation, access changes, impersonation, reassignment, sender edits and deactivation. SUPER_ADMIN must retain ability to inspect all commercial records.

**Critical existing guard:** `/platform/layout.tsx` currently requires SUPER_ADMIN. Replace with explicit platform authorization without granting access to `/platform/shops`, support, billing, platform analytics or subscription mutations. Rework `requireSalesActor` and `authorizedDemoSession` using the real authenticated user identity even when session is impersonating a demo. Regression-test owner/tenant cross-access and demo ownership.

## 4. Prospect and opportunity domain

Recommended models (final names subject to schema audit):
- `PlatformSalesStaff`: userId, role/status, managerId, territory, timezone, locale, signature settings, booking slug/token, availability defaults.
- `CrmProspect`: business name, normalized name, website, address, city/province, phone, general email, business category, staff count band, location count, current software, lead source, assignedStaffId, businessPreferredLanguage `FR|EN|UNKNOWN`, status, tags, createdAt, updatedAt, archive/merge fields.
- `CrmContact`: prospectId, name, title, email, phone, decisionMaker, preferredLanguage override `FR|EN|null`, consent/suppression references, primary flag.
- `CrmOpportunity`: prospectId, assignedStaffId, pipelineStage, fitScore, buyingIntentScore, urgency, estimatedPlan, estimatedValue, estimatedMRR, currency CAD, close estimate, loss reason, wonAt, convertedShopId, currentDemoId.
- `CrmNeed` and `CrmProspectNeed`: taxonomy, severity, evidence, verified/inferred, priority, suggested feature and playbook mapping.
- `CrmActivity`, `CrmTask`: type, owner, dueAt, outcome, note, related entities, immutable author/timestamps.
- `CrmAuditEvent`: actor, action, before/after safe metadata, affected record.
- CRM imports/dedup and provenance; import preview, validation, error report, idempotency and CSV injection defense.

Commercial pipeline: `NEW → CONTACTED → ENGAGED → QUALIFIED → DEMO_SCHEDULED → DEMO_COMPLETED → DECISION → WON`; `LOST`, `UNQUALIFIED`, `DO_NOT_CONTACT` terminal outcomes. Stage changes logged; requirements/guardrails for progression. A lead may have multiple contacts, activities and demos, but no accidental duplicate opportunity creation. Define a primary active opportunity rule.

Needs taxonomy: booking, quotes/invoices, work orders, DVI, communications, retention, inventory, reporting, multi-location. Classify size, specialization, digital maturity, software, urgency, authority, budget, FR/EN. Fit and intent **separate**, explainable, with missing-data treatment and human override. Never invent inferred facts as confirmed. Suggested outreach and demo ordering derive from this structured data.

Language resolution: explicit message override > contact preference > prospect business preference > `UNKNOWN`. `UNKNOWN` requires human decision or approved bilingual template; do not silently assume French. Language editable at import, prospect/contact edit, discovery, before compose, and during demo. Snapshot effective language and template version per outbound message and meeting; do not rewrite history. Sales UI locale is independently configured.

## 5. Sales email and bidirectional inbox

Create **platform-sales messaging** separate from tenant `CommunicationThread` and support `PlatformConversation`. Reuse provider adapters, rendering, UI patterns and notification principles after audit, not shop-scoped models/entitlements.

Suggested models: `CrmSenderIdentity`, `CrmEmailThread`, `CrmEmailMessage`, `CrmEmailAttachment`, `CrmEmailTemplate`, `CrmSequence`, `CrmSequenceStep`, `CrmSequenceEnrollment`, `CrmEmailSuppression`, `CrmEmailDeliveryEvent`, `CrmOutboundJob`. Include provider IDs, RFC Message-ID/In-Reply-To/References, from/to/cc/bcc, direction, staffId, contactId, prospectId, rendered language, send state, timestamps, bounce/unsubscribe status, sanitized content, attachment references and webhook idempotency keys.

Sales inbox: unread, needs reply, assigned to me, all with permission, threading, composer, reply/reply-all as supported, drafts, approved signatures, contact association, attachments with validated limits/storage/scan policy, search/filter, notes (internal only), assign/reassign, activity timeline, delivery state and realtime refresh. Pusher carries signals only; fetch messages via authenticated server action. Staff replies stay attributed even after staff deactivation.

Sender identity: Super Admin provisions `Display Name <alexandre@...>` only on an authenticated verified sending domain; signed branded signature, business address, website, contact info, per-staff Reply-To where routing supports it. Prefer separate outreach subdomain to protect transactional reputation. No automatic arbitrary inbox creation: verify actual receiving solution and DNS/provider capability, and implement inbound routing/webhook or connected mailbox appropriately. **Prove a real outbound→inbound reply round trip** before marking done. Prevent spoofing, injection, cross-staff access, inbound sender forgery assumptions, auto-response loops, bounce loops, attachment XSS, replayed webhook events.

Outbound delivery via durable idempotent outbox/worker; rate limits, retry/backoff, send-at timezone, observability. Inbound parsing verifies provider authenticity, deduplicates, threads by message identifiers and safe fallback, attaches to correct contact/opportunity, stops automation and notifies assigned rep. Failed/unavailable inbound integration must be visible and not falsely represented as functional.

Cold outreach: templates FR/EN and optional 4-touch example Day 1 introduction, Day 4 follow-up, Day 9 demo invitation, Day 16 respectful close; schedule is configurable, not universally appropriate. Pause/stop on reply, meeting, conversion, bounce, opt-out, DNC or manual pause. Require compliant basis and provenance under Canadian CASL rules; do not assume all B2B email is exempt. Include sender identification, mailing address/contact and unsubscribe in commercial email; persist suppression globally across staff/sequence/imports, enforce before every send. Separate transactional meeting confirmations from commercial outreach appropriately. Support draft/review/approval, daily caps, domain warm-up controls and provider event ingestion.

## 6. Sales calendar and email scheduling

Sales calendar is distinct from tenant `Appointment`. Suggested models: `CrmAvailabilityRule`, `CrmAvailabilityException`, `CrmMeeting`, `CrmMeetingAttendee`, `CrmBookingLink`, `CrmCalendarConnection` (optional later), `CrmCalendarEventSync` (optional). Every meeting links prospect/contact/opportunity and seller. Meeting types: video, phone, on-site; 15/30/45/60-minute presets, configurable. Store UTC timestamps, IANA timezone, duration, buffers, cancellation/rebook tokens, statuses, notes, outcome. Respect DST, holidays, overlap, seller absence and idempotent booking under race conditions.

Calendar UX: day/week/month, seller availability settings, task sidebar, prospect-linked event, meeting status, agenda link from outbound email, reusable booking CTA in signature and follow-ups. Public booking URL displays ONLY safe seller identity and available slots, supports FR/EN from contact/prospect or explicit switch, validates email and rate limits, prevents slot double booking and enumeration. Confirmation emails branded GarageOS with .ics invite, reschedule/cancel links, reminders, timezone-aware rendering; stop/update reminders after change. Optionally integrate Google/Outlook OAuth **only after native booking is reliable**; secure encrypted tokens, scope minimization, webhook/sync reconciliation, availability conflicts. Do not promise calendar integration if not actually built.

## 7. Sales Academy, demo assistant and conversion

Training: `CrmPlaybook`, `CrmPlaybookVersion`, `CrmPlaybookStep`, `CrmTrainingProgress`, `CrmDemoRun`, `CrmDemoStepOutcome`. Admin-approved versioned FR/EN playbooks; short learning modules, screenshots or live links, suggested scripts, objection handling, completion and optional practice. Super Admin edits/publishes versions; historic demos retain version used.

Default 25–35-minute adaptive demo:
1. Discovery: ask owner about booking, daily workflow, current tools, pain and decision timeline (3–5m).
2. Personalized booking: real demo branding, QR/booking page, customer journey without submitting fictitious real bookings (3–5m).
3. Dashboard, agenda, clients/vehicles (4–5m).
4. Work orders, estimates, DVI, invoice and practical handoffs (6–8m).
5. Communications, reminders and retention (3–5m).
6. Relevant differentiators (inventory/reporting/multi-shop) only when need justified (2–4m).
7. Objections, value recap, chosen tier, next step and owner activation (3–5m).
Playbook reorders/omits sections according to `CrmProspectNeed` and records skipped/completed steps, objections and prospect interest. Live Demo Assistant is collapsible, private to rep, non-obtrusive on mobile/tablet, and cannot expose notes to prospect-facing views.

Create technical `SalesDemo` via existing audited flow only when rep initiates prepared demo; associate with CRM opportunity; preserve logo/photos, tier switching, real UI, demo session safeguards, owner activation and Stripe Checkout. `WON` only on verified Stripe subscription activation event/status; idempotent attribution, record plan, interval, normalized MRR, owner and shop links; handle activation sent but not paid, payment failure, abandoned checkout, refunds/cancel and subsequent lifecycle separately. Never grant sales rep subscription-edit access to paying tenants. Customer handoff with notes and communication ownership transfer.

## 8. Super Admin team dashboard and reporting

Team roster: active/inactive staff, assigned leads, pipeline, replies, meetings, demos, won/lost, new MRR, cohort and conversion rates. Staff detail: personal inbox/task workload, pipeline hygiene, overdue follow-ups, playbook training, demo steps, attribution, goals, trend and audit. Managers scoped to their teams; Super Admin global. Date/rep/source/language/territory filters; timezone-consistent intervals; stage funnel with clear denominators; normalized MRR not annual contract total; currency CAD. Separate sales-generated MRR from current subscription MRR and retention. No gamified raw-email volume as sole performance indicator. Export permission-gated and PII-safe.

## 9. Cross-cutting acceptance criteria

- Server authorization: seller cannot read another rep's records without explicit scope; cannot access paying tenant admin, shop messages, billing, support or other platform admin; cannot use demo impersonation outside permitted SalesDemo.
- All write paths audit actor and ownership. Staff disable revokes access and outbound identity; history and attribution retained.
- Import: 1,000+ sample records, duplicate handling, malformed rows, CSV formula injection, unknown language, opt-out persistence.
- Language: FR/EN/UNKNOWN and contact override across templates, inbox, calendar and public booking.
- Messaging: provider verification, send, receive reply, thread, stop sequence, bounce/unsubscribe, suppression, webhook replay, retry without duplicate, isolation.
- Calendar: double-booking concurrency, DST Montréal, reschedule/cancel, ICS, reminder idempotency and public abuse prevention.
- Demo: lead→demo→owner activation→Stripe-confirmed Won, including failed/abandoned and non-owner access.
- Accessibility, mobile 390px, tablet, desktop; loading/empty/error states, keyboard navigation.
- Migrations additive/backward compatible, indexes for assignment/status/dueAt/provider IDs, no production data loss. Review migration deployment behavior.
- TypeScript, lint, Prisma validate, targeted tests and full tests; build only in safe environment; manual test matrix and deployment evidence. Never claim tests ran unless logs show it.
- Logs/metrics do not leak tokens, credentials, full email content, attachments or sensitive personal data.

## 10. Three-agent execution contract

**Agent 1: CRM Foundation, staff permissions, prospects and pipeline**. Own platform auth/layout/nav, staff lifecycle, prospect/contact/opportunity/needs/activities/tasks, scoring, CSV import, team roster scaffolding, audit and migrations. Deliver usable secure CRM without fake messaging. Define stable IDs/interfaces for other agents. Include a handoff document with migrations, actual models, routes, permission helpers and tests.

**Agent 2: Sales Communications and Scheduling**. Start implementation only after Agent 1 foundation is merged and deployed. Own sales sender identities, signatures, inbox, inbound/outbound, templates, sequences, compliance/suppression, calendar, public booking and reminders. Reuse Agent 1 authorization and prospect relations. Deliver proven inbound reply and booking flows. External OAuth optional and gated.

**Agent 3: Academy, adaptive demo, conversion and reporting**. Implementation starts after Agent 1 merged and deployed; may run **in parallel with Agent 2** on separate branch IF it avoids Agent 2-owned files, Prisma migrations and shared nav. Own playbook content/training, adaptive demo assistant, existing SalesDemo integration, Stripe conversion attribution and team performance dashboards. Integration with Agent 2 email/meetings should use documented contracts; reconcile after both merge. Prefer sequential Agent 2→3 if schema or shared files conflict.

**Parallel work allowed immediately:** Agent 3 may independently research and write FR/EN demo scripts, objections, training curricula and static playbook content on a separate docs-only branch. It must NOT modify schema, app code, shared files or merge ahead of Agent 1.

Agent deliverable for each: code and migrations, tests, screenshots/evidence where possible, changed files, security review, configuration/env requirements (names only, no values), known gaps, rollback notes, exact handoff. No premature success statements, no test/live provider confusion. No direct production data mutation without explicit authorization.

### Integration and merge gates
- First confirm baseline `main` commit and current Vercel deployment is healthy. Deploy doc-only commit normally.
- Agent 1 works on a feature branch, PR and review; merge after passing checks; verify Vercel deployment and migrations before starting implementation agents 2/3.
- Agent 2 and Agent 3 use separate branches from the latest merged Agent 1 commit, declare file ownership and avoid simultaneous changes to Prisma schema/migrations, `PlatformChrome`, `AdminSidebar`, `routes.ts`, auth/permissions, or conversion code. Coordinate via PRs; rebase/merge sequentially and run full regression.
- If conflicts arise, STOP parallel implementation and serialize Agent 2 then Agent 3. Maximum three agents total.

## 11. Decisions and gates requiring real infrastructure verification

1. **Inbound email:** Confirm available provider receive feature, routing, verified domain, DNS, webhook authenticity and production behavior. Do not create fictional personal mailboxes or assume provider support.
2. **Sender strategy:** Prefer verified sales subdomain; evaluate domain ownership, provider restrictions, DMARC/SPF/DKIM, reply routing and warm-up before automating outreach.
3. **Calendar sync:** Native booking mandatory; Google/Outlook sync explicitly optional, contingent on OAuth configuration.
4. **CASL:** Confirm legal/compliance review for each outbound category, consent/exemption evidence and unsubscribe semantics. Do not ship unsupervised bulk cold outreach without compliant controls.
5. **Existing demo auth:** Re-audit impersonation and actor identity before allowing staff roles.
6. **Stripe conversion:** Verify actual production lifecycle events and existing idempotency/claim handling; never infer Won from a click.
7. **Research assistant:** Human-reviewed recommendations from publicly sourced data; no fabricated research. Optional after reliable core.

## 12. Definition of Done

Super Admin can create a sales rep and approved sender identity; rep signs in with restricted access; imports/qualifies FR/EN prospect; selects needs and records activities; sends compliant personalized email and receives a real reply in branded inbox; prospect books a conflict-free demo through localized link; rep follows adaptive playbook against existing GarageOS demo; owner activates and Stripe-confirmed conversion marks opportunity Won; Super Admin sees attribution and performance; disabled rep loses access and records can be reassigned; tests, audit, migration and deployment evidence support all claims.

## 13. References

- `docs/sales-demo-implementation-plan.md`
- `docs/demo-journey-implementation-plan.md`
- `docs/communications-platform.md`
- `docs/platform-super-admin.md`
- `src/app/platform/layout.tsx`
- `src/lib/sales-demo.ts`
- `src/actions/sales-demo.ts`
- `src/actions/sales-demo-conversion.ts`
- `src/lib/sales-demo-conversion.ts`
- `src/actions/platform-messages.ts`
- `src/lib/email-config.ts`
- `src/components/admin/PlatformChrome.tsx`
- `src/components/admin/AdminSidebar.tsx`
- `src/lib/routes.ts`
- `prisma/schema.prisma`
