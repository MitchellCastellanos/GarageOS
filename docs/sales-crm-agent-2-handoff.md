# Sales CRM — Agent 2 handoff (communications & scheduling)

Branch `claude/sales-comms-scheduling` → PR to `main`. Baseline: `main` @ `868c152` (Agent 1, PR #87, merged — verified).

**Recommendation: GO for merge to Preview. NO-GO for relying on it in Production until the live items in §9 are verified** (provider DNS/inbound, real reply round trip, real Resend send). The code is complete and tested against a real Postgres with a *fake* Resend transport; **nothing in this work was verified against the live provider** (no credentials/DNS were available, and none were configured or touched).

## 1. What shipped
- **Sender identities** (Super Admin): name, address, title, phone, signature, default language, reply mailbox, daily-limit override, activate/disable. Activation is refused unless the *provider* reports the sending domain verified (live `domains.list`). No fallback sender anywhere.
- **Sales Inbox** `/platform/sales/inbox` (+`/[threadId]`, `/new`): filters (all/unread/needs-reply/mine/drafts/done), search, threads, composer (recipients, cc, template, language override, preview in sandboxed iframe, send now, schedule, draft, booking-link insert, attachments), internal notes, status, reassignment, link-to-prospect, opt-out recording, delivery status, retry, Pusher *signals* (no content) + authenticated refetch.
- **Templates**: 10 keys × EN/FR (intro, follow-up, demo invitation, post-demo, pricing, closing, meeting confirmation/reminder/rescheduled/cancelled). Versioned approvals by Super Admin; built-ins are version 0. Language/version persisted per message.
- **Sequences** `/platform/sales/outreach`: Super Admin authors/activates (default Day 1/4/9/16 = offsets 0/3/8/15 business days, editable); sellers enroll/pause/resume/stop. Never auto-activates.
- **Calendar** `/platform/sales/calendar` (day/week/month), availability + days off + durations + types + own meeting-room link `/calendar/availability`; outcomes + follow-up tasks; team view for managers/SA.
- **Public booking** `/sales/book/[token]`, self-service `/sales/meeting/[token]`, unsubscribe `/sales/unsubscribe/[token]` (EN/FR switch).
- **Meeting emails**: confirmation (+.ics), 24 h/1 h reminders, reschedule (ICS SEQUENCE bump), cancellation (ICS CANCEL), rendered at send time.
- **Admin** `/platform/sales/settings/communications`: master kill switch, approved domains, inbound domain, CASL identification, limits, live setup checklist per identity, templates, suppression (lift needs reason), delivery problems, upcoming meetings.
- Prospect page gains a Communications card (CASL basis per contact, threads, meetings, enrollment).

## 2. Data model (migration `20261009180000_sales_comms_scheduling`, purely additive)
New: `CrmCommsSettings` (singleton, seeded with `sendingEnabled=false`), `CrmSenderIdentity`, `CrmEmailTemplate`, `CrmEmailThread`, `CrmEmailMessage` (also the durable outbox), `CrmEmailAttachment`, `CrmEmailNote`, `CrmEmailDeliveryEvent` (webhook ledger), `CrmEmailSuppression`, `CrmSendingBasis`, `CrmSequence/Step/Enrollment`, `CrmAvailabilityException`, `CrmBookingLink`, `CrmMeeting`, `CrmSellerCalendar` + enums; three `ALTER TYPE CrmActivityType ADD VALUE` (`EMAIL_SENT`, `EMAIL_RECEIVED`, `SEQUENCE`). No drops/rewrites. Race-proof invariants in SQL: unique provider id; one active suppression per address; one live enrollment per contact+sequence; one active general booking link per seller; one scheduled meeting per seller per start instant; time/limit CHECKs. Replayed from full history on Postgres 16; `migrate diff` = no drift. Meeting overlap is prevented by row-locking the seller (`FOR UPDATE`) — no `btree_gist` dependency.
Rollback: drop the new tables/enums (data is only sales comms); the three enum values are harmless if left.

## 3. Architecture
Outbound: `CrmEmailMessage` row in `QUEUED/SCHEDULED` with `nextAttemptAt` **is** the job. `dispatchMessage` claims by compare-and-set (`QUEUED→SENDING`), re-checks policy at send time (kill switch, identity/staff active, domain approved, suppression, DNC, CASL basis, daily cap, language, meeting revision, sequence state), sends via the repo's *gated* Resend client with `Idempotency-Key = message id`, retries with backoff (1/5/15/60/240 min, 5 attempts), reclaims stale `SENDING` after 5 min. `PROVIDER_SIDE_EFFECTS=enabled` is required, exactly like tenant email.
Inbound: shared `/api/webhooks/resend` (Svix-verified, unchanged secret). Sales is tried first and claims only events whose message/address is its own; otherwise the tenant handlers run as before. Bodies are fetched with the SDK's `emails.receiving.get` (**the existing tenant inbound route calls `/emails/inbound/{id}`, which the installed SDK does not document — see §8**). Matching: reply key in `name+<key>@inbound` → RFC `In-Reply-To/References` → subject only within same identity+counterparty ≤30 days. Dedup on provider email id (unique); delivery events deduped on Svix id. Inbound HTML is never stored or rendered (flattened to text). Auto-replies/out-of-office are stored but don't count as replies.
Separation: no `shopId`, no tenant tables, own storage bucket (`sales-email`), own Pusher channel `private-sales-inbox-<userId>` (own channel + must still be an active sales user).
Cron: `/api/webhooks/cron/sales` (daily in `vercel.json`; Hobby limit). Reminders/scheduled sends are only as punctual as the cron; "send now" and booking confirmations dispatch immediately. For minute-level punctuality call it every 5–10 min with `Authorization: Bearer $CRON_SECRET`.

## 4. Routes / actions
Pages: see §1. API: `POST|GET /api/sales/unsubscribe/[token]` (RFC 8058 one-click; GET only redirects), `GET /api/sales/meeting/[token]/ics`, `GET /api/sales/attachment/[id]` (scope-checked → 60 s signed URL), `GET /api/webhooks/cron/sales`.
Actions: `sales-inbox`, `sales-sequences`, `sales-calendar`, `sales-comms-admin` (Super Admin), `sales-booking-public` (public, rate-limited). Capabilities: added `enroll_sequences`, `manage_calendar` (reps+); `manage_sender_identities`/`manage_sequences` stay Super Admin only.

## 5. Configuration (names only)
`RESEND_API_KEY`, `PROVIDER_SIDE_EFFECTS=enabled`, `RESEND_WEBHOOK_SECRET` (existing), `NEXTAUTH_SECRET` (signs unsubscribe tokens), `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, Supabase storage vars (attachments), `PUSHER_*`/`NEXT_PUBLIC_PUSHER_*` (optional realtime). Settings in-app: approved domains, inbound domain, mailing address (required for commercial email), limits.

## 6. DNS / provider setup (not done — needs explicit approval)
1. Use a dedicated sales subdomain (e.g. `sales.garage-os.ca`) to isolate cold-outreach reputation from transactional mail. Add it in Resend with sending **and** receiving enabled; publish SPF/DKIM (and DMARC) and the **MX** record Resend gives for receiving.
2. A verified sending domain does **not** create mailboxes. Replies work because Resend receives for the whole subdomain and GarageOS routes by `name+<threadkey>@sales…`. Personal mail clients writing to `alexandre@sales…` directly also reach his inbox (matched by local part).
3. Register the webhook `https://<app>/api/webhooks/resend` for `email.received`, `email.sent/delivered/delivery_delayed/bounced/complained/failed/suppressed`.
4. In-app: approve the domain, set inbound domain + mailing address, create identities, activate (checklist shows each blocker), enable the master switch.
The identity's "reply round trip verified" flag is set **only** by a real human reply arriving through that identity.

## 7. Compliance controls (CASL) — product controls, not legal advice
Commercial email requires a documented, unexpired **sending basis** per contact (kind + evidence ≥12 chars, optional expiry); sender identification + mailing address + working unsubscribe (link and RFC 8058 header) in every commercial message; global suppression (unsubscribe, hard bounce, complaint, manual, reply opt-out) enforced at enroll **and** at every send, independent of CSV re-imports; unsubscribe also flags contacts DNC; daily caps; seller-timezone business-day/hour window; replies limited to people already in the thread (adding a new recipient makes it a solicitation again). Meeting notices are transactional (blocked only by hard bounce/complaint). Obtain legal review before enabling bulk outreach.

## 8. Known limitations / findings
- **Live round trip unverified** (§9). Whether Resend honours our `Message-ID` header is unverified; we also record the provider's own id from webhooks, and the reply key makes threading independent of it.
- Existing **tenant** inbound route (`src/app/api/webhooks/resend/route.ts`, shop inbox) still uses `/emails/inbound/{id}`; the installed SDK exposes `emails.receiving.get`. Left untouched (out of scope) — recommend a separate fix.
- Google/Outlook calendar sync **not built** (documented future work); the UI says so.
- No conference links are ever created; VIDEO meetings use only the seller's pasted room link, otherwise the email says the seller will send it.
- Meetings of a deactivated seller are not auto-reassigned; their notices are blocked (staff inactive). Opt-out phrase detection is a hint; a human confirms.
- Rate limiter fails open on DB error (existing behaviour). No CAPTCHA (honeypot + timing + per-IP/email/seller limits + token-guess throttle).
- Realtime requires Pusher; otherwise the page refreshes on focus.

## 9. Verification status
| Check | Result |
|---|---|
| `npx prisma validate` | valid |
| `npx tsc --noEmit` | clean |
| `npx eslint src tests` | 0 errors, 51 warnings (= baseline) |
| `npm test` | 676 pass, 0 fail, 2 skipped (DB suites) — includes 30 new domain tests (DST, availability, CASL, templates EN/FR parity, threading, ICS, setup state…) |
| DB suites (real PG16, fake Resend): `GARAGEOS_CRM_TEST_DB_URL=postgresql://postgres@127.0.0.1:54329/garageos_replay npx tsx --test tests/sales-crm-db.test.ts tests/sales-comms-db.test.ts` | 37/37 (28 new; re-runnable): access isolation, identity permissions, draft/send/schedule, retries/idempotency, concurrent workers, signed webhooks, duplicate events, reply stops sequences, bounce/complaint/unsubscribe suppression, concurrent booking (8 racers → 1), reschedule/cancel/reminder idempotency, public abuse limits, cross-seller/tenant isolation, DB invariants, Agent-3 contracts |
| `npx next build` (no DB env) | success, all new routes present |
| Visual (Playwright, seeded local DB): 49 captures at 390/820/1366 | no horizontal overflow; one real bug found and fixed (Intl option clash on manage page) |
**Not run / not verified:** Neon integration suite; any live Resend send/receive, DNS, webhook delivery, Pusher, Supabase attachment storage; a real mail client rendering of the HTML.

## 10. Contracts for Agent 3 — `src/lib/sales-comms/contracts.ts` (v1, scope-checked, read-only)
`getMeetingHistory`, `getEmailEngagement` (counters only), `getCommunicationTimeline`, `getSequenceState`, `getBookingStatus`, `getPostDemoFollowUp` (eligibility + composer URL pre-filled with `POST_DEMO_FOLLOW_UP`; sends nothing). Meeting outcome enum `CrmMeetingOutcome`; meetings never change the pipeline stage and nothing here sets Won. Shared files touched: `schema.prisma`, `routes.ts`, `AdminSidebar.tsx`, `access.ts` (2 capabilities), `audit.ts` (actions), `rate-limit.ts`, `storage.ts`, Pusher channel/authz, Resend webhook route, prospect page (one panel), `sales-crm.ts` copy (3 activity labels).

## 11. Deploy / rollback
Deploy runs the additive migration first (Production only, existing guard). Sending stays **off** (`sendingEnabled=false`) until Super Admin completes setup — nothing is sent or enrolled on deploy. Rollback: revert code; optionally drop the new tables.
