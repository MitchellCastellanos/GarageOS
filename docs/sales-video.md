# Sales video: website, shareable page, CRM and attribution

The four approved commercials (`full-en/fr` 60 s, `teaser-en/fr` 15 s, produced in `video/`) are now part of the public site and the sales CRM.
Nothing here re-renders or changes the videos, builds a new CRM, or sends anything: sellers still press Send.

```
Sales email ──thumbnail──▶ /watch/{en|fr}[/teaser]?t=<opaque token> ──play──▶ MP4 from the CDN (never from Vercel)
                                   │ beacon (first-party, no cookies)            │
                                   ▼                                            ▼
                         /api/video/event  ─▶ CrmVideoEvent + prospect timeline   /api/video/cta?cta=demo ─▶ the seller's EXISTING booking page (/sales/book/<token>)
```

## What was added
| Area | Where |
|---|---|
| Home page block (follows the site EN/FR language; swaps video at the same position on language switch; 15 s preview link) | `src/components/video/HomeVideoSection.tsx`, `src/app/page.tsx` |
| Shareable bilingual pages | `/watch/en`, `/watch/fr`, `/watch/en/teaser`, `/watch/fr/teaser` (`src/lib/watch-page.tsx`, `src/components/video/WatchClient.tsx`) |
| Player (poster first, no MP4 until play, no autoplay, play/pause, seek, mute, volume, full screen, keyboard, touch, retry on failure) | `src/components/video/VideoPlayer.tsx` |
| Attribution tokens, events, CTA redirect | `src/lib/sales-video.ts`, `src/domain/sales-video.ts`, `src/app/api/video/{event,cta}/route.ts` |
| Composer "Insert video" (60 s / 15 s, language from the recipient), `{{video.link}}` in templates and sequences now resolves to the tracked link | `Composer.tsx`, `insertVideoLink` action, `withVideoVars` |
| Email: clickable approved thumbnail + button (no MP4, no `<video>`), seller signature/unsubscribe unchanged | `src/lib/sales-comms/content.ts`, `src/emails/SalesEmail.tsx` |
| CRM: timeline entries + per-prospect "Video engagement" card (same scope rules as the prospect page) | `prospects/[id]/page.tsx`, `VideoEngagement.tsx` |
| Posters / email thumbnails (derived from the approved thumbnails, 35-57 KB) | `public/video/{thumb,email}-{en,fr}.jpg` |
| Database (additive migration) | `prisma/migrations/20261011090000_sales_video_attribution` (`CrmVideoLink`, `CrmVideoEvent`, `CrmVideoLinkMessage`) |
| Registry (existing) | `PlatformVideo`: keys **`commercial`** and **`teaser`**, one row per language; Platform → Sales → Settings → Videos |

## Hosting decision (needs your approval: nothing was purchased or created)
GarageOS has had Vercel bandwidth/storage trouble, so **no MP4 is served by the app, Next.js routes, or Git**. Vercel only serves HTML and the 55 KB posters. The MP4s must be served by a CDN with `video/mp4`, byte ranges and long caching.

| Option | Cost shape | Notes |
|---|---|---|
| **Cloudflare R2 + custom domain (recommended)** | Storage ~25 MB (inside the 10 GB free tier); **no egress fees**; CDN caching on a custom domain such as `video.garage-os.ca` | GarageOS already uses Cloudflare (inbound email). R2 may need a payment method on the account even when usage stays free. |
| Supabase Storage | The public bucket is limited to 5 MiB per file today (would need a new bucket/limit) and egress counts against the Supabase plan | Already integrated, but the wrong tool for 19 MB files. |
| Vercel Blob / Vercel static | Bandwidth billed on Vercel | Rejected: the exact problem to avoid. |
| Mux / Bunny Stream / YouTube | Paid or third-party tracking | Not needed for four files; third-party players conflict with the privacy design. |

**Decision needed from you:** approve R2 (or name another provider). The code is provider-neutral: it only needs four https URLs.

## Manual setup (in order)
1. **Files.** The approved renders (`video/output/full-en.mp4` etc., gitignored) are uploaded unchanged under these names (version suffix = cache busting): `garageos-commercial-en-v1.mp4`, `garageos-commercial-fr-v1.mp4`, `garageos-teaser-en-v1.mp4`, `garageos-teaser-fr-v1.mp4`. Object metadata: `Content-Type: video/mp4`, `Cache-Control: public, max-age=31536000, immutable`. (A new cut = `-v2` names, then update the registry.)
2. **Domain.** R2 bucket → Custom Domains → e.g. `video.garage-os.ca` (this turns on Cloudflare caching and range support).
3. **Verify** the CDN (read-only): `npm run video:verify-cdn -- https://video.garage-os.ca` checks HTTPS, `video/mp4`, `Accept-Ranges`, cache headers, size and a `206` ranged response for all four files.
4. **Migration.** Ships with the normal build (`npm run build` runs `prisma migrate deploy` on the Production deploy; see `docs/db-migrations.md`). Additive; no existing table changes.
5. **Registry.** Either fill the four rows in Platform → Sales → Settings → Videos (keys `commercial` / `teaser`, EN and FR, https URL, status Published; the thumbnail field is optional), or run once against the target database:
   `npm run video:seed-registry -- --cdn-base https://video.garage-os.ca --site https://www.garage-os.ca` (dry run) then add `--yes` (writes drafts) and `--publish`.
6. **Environment.** `NEXT_PUBLIC_APP_URL` must be the production https origin (the emailed links and thumbnails are absolute). No new variables or secrets.
7. **Check in production:** `/` shows the video block; `/watch/en` and `/watch/fr`; in the CRM, insert a video in a test email to your own test recipient and read the preview.

Until step 5 is done nothing user-visible changes: the home block hides itself, the watch pages show a friendly "not available" card with the demo CTA, and the composer says no video is published.

## How sellers use it
Composer → pick the prospect → **Insert video** (60-second commercial or 15-second teaser). The language is the email language (override > contact > prospect; it is blocked while unknown). A tracked link is added to the body; **Preview** shows the approved thumbnail and button. Signature, sender identity, unsubscribe footer, CASL policy, queue and scheduling are the existing ones. Templates that use `{{video.link}}` (including sequence steps) get the same tracked link automatically; if no video is published the variable stays empty and the existing "video required" blocking applies. The MP4 is never attached.

## Tracking and attribution
* **Token**: 256-bit opaque, one per (seller, prospect, contact, video, language), 90-day expiry, revocable, re-used when the same video is inserted again (re-issued within 7 days of expiry). The URL carries nothing else: no ids, no email, no name. Attributed pages are `noindex`; clean `/watch/en` URLs are public and indexable with `VideoObject` data.
* **What each event means**
  | Event | When it is recorded |
  |---|---|
  | `PAGE_VIEW` | The page script ran in a visible tab ~1.5 s after load (a mail scanner, link preview or prefetch that only fetches HTML never triggers it). Shown as **"Opened the video page"**, never as watched. |
  | `PLAY` | A real `play` event from the player the visitor opened (the MP4 does not even exist in the page until they press play). |
  | `PROGRESS_25/50/75`, `COMPLETE` | Only continuous playback counts (seeking adds nothing; dragging to the end yields nothing). The server additionally requires a `PLAY` from the same page view and enough elapsed real time (e.g. 75% of 60 s needs ≥ 38 s). `COMPLETE` needs ≥ 90% really watched. |
  | `CTA_DEMO`, `CTA_TRIAL` | Server-side, from the redirect `/api/video/cta`, human traffic only; flagged "after watching" if playback came first. Demo goes to the seller's own prospect booking link (the existing `/sales/book/<token>` flow, so `CrmMeeting` already carries prospect, seller and source); sellers without online booking, invalid or expired tokens go to `/contact`. Trial goes to `/get-started`. |
* **Dedupe**: one `CrmVideoEvent` row per (link, type) with a count of *distinct page views*; reloads, retries, duplicate requests and scanner re-fetches cannot inflate it. Per-link counter cap, per-IP request limiter, 2 s flood guard. The first occurrence of page view, play, 75%, complete and CTA also writes a timeline entry (`SYSTEM` activity: it does **not** count as a sales touch, so territory ownership rules are unaffected). 25%/50% stay in the summary card only.
* **Not measured**: no token → nothing is ever sent; Do Not Track / Global Privacy Control → nothing is sent; do-not-contact prospect/contact or a suppressed (unsubscribed) address → nothing is recorded; bots/scanners/prefetch (user-agent and `Purpose`/`Sec-Purpose` headers) → ignored.
* **Privacy**: first-party only, no cookies, no storage in the browser, no third-party analytics, no IP or user-agent stored by these endpoints. The attributed page shows a short EN/FR notice, and the privacy policy has a new "Video links in our emails" section (EN/FR). **Have counsel review that wording** (CASL/Law 25) before launch.
* **Failure isolation**: the endpoints always answer 204/redirect; blocked tracking, a failing database or a down CDN never stops playback or the demo CTA (tested).
* **Known limit**: a seller cannot prove a *person* watched (a forwarded email, shared devices). The labels say "opened", "started", "watched ~75%", never "read".

## Verification performed
See the PR description. Evidence screenshots (EN/FR, desktop/tablet/mobile, email previews): `docs/sales-video-evidence/`.
* Unit: `tests/sales-video-domain.test.ts` (URLs, tokens, bots/prefetch, playback tracker, plausibility, email block).
* Database (real Postgres): `tests/sales-video-db.test.ts` (seller isolation, scope, roles, publish rules, token expiry/revocation, dedupe, CTA, do-not-contact and suppression, territory untouched, email content, template variable). Run with `GARAGEOS_CRM_TEST_DB_URL=postgresql://…@127.0.0.1:…/…scratch… npx tsx --test tests/sales-video-db.test.ts`.
* Browser (Chromium, production build): no MP4 requested on load, play on click, language switch keeps the position, no horizontal overflow at 390/820/1440, tracking blocked, CDN unavailable, Do Not Track, unknown token, CTA lands on the booking page, correct server-side events.

## Limitations
* The test Chromium has no H.264, so playback was exercised with WebM transcodes of the same videos behind a local HTTPS range server; the real MP4 files were checked for CDN behaviour (`verify-cdn`) and for codec/duration in `video/`. Please play the real files once on Safari/iOS and Chrome after upload.
* The CRM screens (composer button, timeline, summary card) are covered by tests and code review but were not screenshotted (no authenticated session in the sandbox).
* Events and links are not purged automatically (links expire after 90 days; add a retention job if your policy requires deleting engagement data sooner).
* Video captions are burned into the files; there is no separate caption track.

## Rollback
Unpublish the four videos (the site and composer hide themselves) or revert the PR. The migration is additive; the three tables can stay.
