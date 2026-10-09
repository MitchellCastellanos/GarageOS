# Sales email — launch readiness, audit findings and live-test runbook

Status: **code complete; live provider verification NOT performed from the build environment** (see "What could not be verified"). No credentials, tokens or URLs with secrets appear here.

## 1. What was verified (October 10, 2026)
| Check | Result | Source |
|---|---|---|
| Latest production deployment | `main` @ `730e79f` (PR #90) READY; PR #88 comms deployed before it (so the comms migration is live) | Vercel deployments API |
| Production env var **names** present | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, `EMAIL_FROM_PLATFORM`, `EMAIL_FROM_INVOICES/REMINDERS/WEB`, `EMAIL_MANAGED_DOMAIN`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `PROVIDER_SIDE_EFFECTS` | Vercel project env (names only) |
| Provider side-effect gate | `PROVIDER_SIDE_EFFECTS=enabled` in **Production**, `disabled` in Preview (correct: previews cannot send) | Vercel project env (plain value) |
| Cron | `/api/webhooks/cron/sales` runs **once daily at 12:30 UTC** (`vercel.json`). "Send now", booking confirmations and replies dispatch immediately; **scheduled sends and sequence steps are only as punctual as this cron** | `vercel.json` |
| Unit/DB tests (fake Resend transport) | outbound idempotency, retries, webhooks, replies stop sequences, suppression, unsubscribe, signature, territory rules: all pass | `tests/sales-*.test.ts` |

## 2. What could not be verified (needs the owner / a machine with provider access)
The build environment has no outbound access to `api.resend.com` or DNS-over-HTTPS and the production `RESEND_API_KEY` is an encrypted Vercel secret that is not readable. Therefore **not verified**: sender-domain verification status, SPF/DKIM/DMARC records, receiving (MX) domain, webhook registration, `NEXTAUTH_SECRET`/`AUTH_SECRET` in Production (neither name appeared in the Production env listing — unsubscribe links are signed with it and login depends on it; confirm it is defined, possibly as a shared variable), and **no live test email was sent**. DNS was not touched.

The in-app **Settings → Sales communications** checklist reads the provider live and shows the exact blocker for each identity; it is the authoritative verification.

## 3. Owner actions to go live (in order)
1. In Resend: domain for sending (recommended: the root `garage-os.ca`, or a dedicated sales subdomain) shows **Verified** with SPF + DKIM; add a DMARC record (`p=none` to start, then tighten). Enable **receiving** on the inbound domain and publish Resend's MX record.
2. Register the webhook `https://<app>/api/webhooks/resend` for `email.received`, `email.sent/delivered/delivery_delayed/bounced/complained/failed/suppressed` (secret already set).
3. Confirm `NEXTAUTH_SECRET` (or `AUTH_SECRET`) and `NEXT_PUBLIC_APP_URL` (public **https** origin — the logo in the signature needs it) in Production. Optionally set `SALES_TEST_RECIPIENTS` (comma list) so the test-recipient tool accepts the Hotmail test address.
4. In-app (Super Admin): Sales communications → approve the sending domain, set the inbound domain, mailing address and legal name, then flip the master switch. Create a sales user with a `@garage-os.ca` login (identity auto-provisions and auto-activates when the provider confirms the domain).
5. (Optional, for punctual scheduled/sequence sends) call `/api/webhooks/cron/sales` every 5–10 minutes with `Authorization: Bearer $CRON_SECRET` from an external scheduler or a paid Vercel plan.

## 4. Controlled live-test matrix (authorized recipient: the owner's Hotmail address)
Run after §3. Use Settings → Sales communications → **Internal test recipient** (prepares a labelled `[TEST]` prospect with a documented basis; sends nothing), then the normal composer. Record only provider message IDs and statuses.
| # | Test | How | Result |
|---|---|---|---|
| 1 | Corporate invitation | Create a sales user with a corporate login and the Hotmail address as the *recovery* email | **not run** |
| 2 | Recovery-email confirmation | Account → change recovery email → open the link in the new mailbox (recipient completes it) | **not run** |
| 3 | Password recovery | `/sales-recover` with the corporate login (recipient completes it) | **not run** |
| 4 | One-off commercial email + signature | Composer → test prospect; check signature, footer, unsubscribe | **not run** |
| 5 | Template email | Composer → template "Initial introduction" (EN and FR) | **not run** |
| 6 | Scheduled message | Composer → schedule; delivered by the next cron run | **not run** |
| 7 | Sequence delivery | Enrol the test prospect in an *activated* sequence (one test only) | **not run** |
| 8 | Unsubscribe | Click the footer link; confirm suppression, then send is blocked | **not run** |
| 9 | Reply handling | The recipient **replies from their mailbox**; confirm thread, notification and `inboundVerifiedAt` | **not run** |
Do not complete the invitation/reset links on the recipient's behalf. Do not fabricate the reply.

## 5. Operational answers
- **One-off sales email operational?** Yes in code and in the production deploy; becomes live when §3.1–§3.4 are true (the checklist turns the identity to READY). Unverified live.
- **Scheduled outreach operational?** Yes, with once-daily punctuality until §3.5.
- **Sequences ready to activate?** Yes (templates EN/FR, signature, CASL, territory rules). Nothing is activated or enrolled; Super Admin activates explicitly. Greater Montréal FIELD prospects cannot be enrolled for cold first contact until a documented visit.
