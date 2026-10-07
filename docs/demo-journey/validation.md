# /demo journey — implementation evidence

Date: 2026-10-07. Branch: `claude/garage-laurent-demo-handoff-jlbg9o` (PR #83; includes the seed/asset handoff).

## Verdict

**Real captures: 23 of 25 views, FR + EN, plus the static invoice PDF. 2 views intentionally omitted (12, 22). /demo now shows them.**
Nothing is a placeholder: every image in `public/demo/garage-laurent/` comes from the running product or its real renderers.

## How it was produced (remote environment, laptop not needed)

- Local PostgreSQL 16 in the container (dev DB `garageos_marketing_local`), migrations applied, `seed:marketing-garage-laurent` run (dry-run first, then real; re-run is idempotent). No production/Preview database touched.
- Images: no Supabase Storage credentials exist in this environment (`NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` not provided). The six photos were verified byte-identical by SHA-256 against `garage-laurent-assets-manifest.json`, then `attach:marketing-garage-laurent-assets` was run unchanged against a **local stand-in for the Storage API** (dev-only, outside the repo). Result: logo, cover, workshop and 2 DVI photos linked to the shop/inspection; second run reported "already attached". Real Supabase Storage was not written.
- Owner password: generated per session, passed via `DEMO_OWNER_PASSWORD`, stored outside the repo, never printed. Access links (portal / report / quote) were written by the seed to a file outside the repo.
- App: `next dev --webpack`, provider side effects disabled, all provider keys empty, communications suspended on the shop. No SMS/email sent, no charge, nothing sent to any provider.
- Capture: `scripts/demo-journey/capture.mjs` (adjusted: settle waits, `#cita` scroll, taller phone viewport for the quote, per-locale handling). Documents: `render-documents.ts` (real email components + `generateInvoicePdf`, no transport) and `shoot-documents.mjs`.

## Captured / omitted

| Group | State |
| --- | --- |
| 01–11, 13, 17, 18, 21, 23–25 (app screens) | Captured FR + EN |
| 06, 14, 16, 19 (emails), 15 (invoice PDF first page), `invoice-camille.pdf` | Rendered from real renderers, FR + EN |
| 20 campaign email | Rendered FR; EN reuses it with the badge "Sample campaign written in French" (the seeded campaign text is French only) |
| 12 approval history | **Omitted**: the product has no admin surface that lists approval decisions. Not invented. |
| 22 SMS inbox | **Omitted**: the seeded shop has no conversations. Not invented. |

Labels: 11 (quote on phone) is **Alexandre's pending quote, 218.45 CAD** and 14 (ready email) is **Sophie's visit**; both carry the badge "Another sample visit". Camille's finalized invoice/quote were not modified.

## Language handling (honest notes)

- Admin screens: the owner's `preferredLocale` was set to EN only while capturing EN, then restored to FR. Shop data (service names, notes, inspection comments) is Quebec French by design, even in EN screens; `/demo` says so.
- Public pages: booking uses the page language switch; quote/portal/inspection follow the customer/document language, switched temporarily in the dev DB for the EN capture and restored. The EN invoice PDF/email are the same real renderers with the render language in memory only (no DB change to the fiscal document).
- Hidden during capture only: the floating WhatsApp button and the dev indicator. No product UI was edited.
- SMS compositions regenerated with reference date 2026-10-07 so they match the confirmation email (Thu 8 Oct).

## Dashboard activity (update)

The first dashboard capture showed 0 appointments today and 0.00 $ revenue. Cause: the dashboard queries use the **server's local date/time zone** (`new Date()` in `src/app/admin/(shop)/dashboard/page.tsx`: today = server-local day, month = server-local month, paid invoices filtered by `paidAt >= start of month`), while the seed had no appointment on the reference day and no paid invoice in the current month. Product queries were not changed.

Fix, in the seed dataset only (`scripts/marketing/garage-laurent-dataset.ts`, create-only and idempotent, so existing rows and the other captures are unchanged):
- 3 appointments on the reference day (`today` day kind: 08:00 and 13:00 olivier, 10:00 mathieu; confirmed/scheduled; no overlaps, inside shop hours).
- 3 paid invoices flagged `thisMonth` (INV-0009 to INV-0011: 143.72 + 143.72 + 114.98 = 402.42 CAD), dated 13:30 shop time on business days of the reference month, clamped to the month's first business day so they stay in the month even when run early in the month. New numbers follow the existing sequence, so their numbers are higher than the draft INV-0008 issued later; cosmetic.
- Time zone: all seeded instants are mid-day in America/Montreal (12:00-17:00 UTC for appointments, 17:30 UTC for payments), so "today" and "this month" agree in UTC and in Montreal. The dashboard formats times with the **process** time zone, so the capture server ran with `TZ=America/Montreal` (shows 8 h 00 / 10 h 00 / 13 h 00). On a UTC host the same dashboard prints those times as 12 h 00 / 14 h 00 / 17 h 00; that is existing product behaviour, noted but not changed.
- Re-seeded the dev DB (3 appointments and 3 invoices created, 0 duplicates). Recaptured 01 dashboard (FR/EN), and 02 agenda and 24 reports (their data changed too). Shown values come from the app: 3 appointments today, 8 clients, 11 invoices, 402,42 $ this month. The "-52.1 % vs last month" arrow is the product's real comparison with September (840.47 $).
- Unit tests: 11 dataset tests (new one covers today's appointments and the month clamp for refs 2026-10-30, 11-02, 12-01).

## Static independence

After the final assets were built, Postgres, the Storage stand-in and the capture server were all stopped and `/demo` was served by `next start` in a clean environment (no DATABASE_URL, no Supabase vars, no secrets). The page returned 200 while a DB-backed page (`/book/garage-laurent-demo`) returned 500, proving the infrastructure was off. QA on that server: 0 cross-origin requests, 0 responses >= 400, 0 console errors, invoice PDFs served (200 application/pdf). Code, `manifest.json`, `messages.json` and the PDFs contain no `localhost`, `127.0.0.1`, port 55441 or Supabase URL (grep + `pdftotext`/`strings`).

## Checks

- `npx tsc --noEmit`: clean. `npm test` (clean env): 596/596. (Two `auth-claims` tests fail only if AUTH_* env vars of the capture session are exported; unrelated.) ESLint on touched demo/email files: clean.
- `npx next build`: OK (`/demo` static).
- `/demo` QA (`qa-demo-page.mjs`, production build, repeated after the dashboard recapture), FR/EN × 390/768/1440: horizontal overflow 0, broken images 0 (26 images), anchors land below the sticky header, lightbox opens / full-size toggle / Escape / focus returns, invoice SMS link opens the viewer, zero console errors. Mobile, tablet and desktop were also inspected by eye.
- Secret sweep: owner password, DB password and all private tokens searched across `docs/`, `public/`, `scripts/` (text and binary): no hits. `capture-log.json` stores route templates only. PDF metadata: title/author (shop name) only.
- Evidence: `docs/demo-journey/evidence/demo-{fr,en}-{390,1440}.png` (full page; sticky header repeats mid-page in full-page screenshots).

## Final status (PR #83 closed out)

Definitive: 23 of 25 views captured in FR + EN, plus `invoice-camille.pdf`. **Omitted on purpose: 12 approval history** (no admin surface in the product lists approval decisions) **and 22 SMS inbox** (seeded shop has no conversations). Nothing invented. Final checks: `tsc` clean, `npm test` 597/597 (clean env), ESLint clean on touched files, `next build` OK, `/demo` QA FR/EN x 390/768/1440 with 0 overflow / 0 broken images / 0 console errors / 0 cross-origin requests, secret sweep clean. All final captures, assets, manifests and docs are committed and pushed to the PR head.

## Follow-up: dashboard time zone + real Storage read check (branch `claude/garage-laurent-dashboard-tz-tuut3j`)

Date: 2026-10-07. Based on the PR #83 head; PR opened against that branch.

### 1. Dashboard time zone: resolved
- `src/app/admin/(shop)/dashboard/page.tsx` now reads `Shop.timezone` (fallback `DEFAULT_TIMEZONE`) and gets every window from `getDashboardRanges()` (`src/lib/dashboard-ranges.ts`): today, this month, last month, 6-month chart, all converted to UTC instants with the existing `parseShopDateTime`. No `TZ` setting on the server is needed.
- Monthly chart buckets use the shop month (`shopMonthOf`), not `getMonth()` of the process. Appointment times are rendered with `timeZone: shop.timezone`.
- Last-month queries are now `[startOfLastMonth, startOfMonth)` (`lt`) instead of `lte 23:59:59`, so a payment in the last second of the month is no longer lost.
- Latent bug found and fixed in `parseShopDateTime` (`src/lib/shop-timezone.ts`): it returned an arbitrary second inside the requested minute (e.g. `15:00:56.249Z` for a `00:00` boundary). It now returns the start of the minute. This benefits every caller (reports, booking, appointments).
- Tests (`tests/dashboard-ranges.test.ts`, 8): day flip at 23:30 local, month flip, payment at the month edge, DST fall back (25 h day), DST spring forward (23 h day), 6-month window across DST and year change, a zone east of UTC (Asia/Tokyo), and identical results/hours under process `TZ` = UTC, America/Montreal, Asia/Tokyo, Pacific/Kiritimati.
- No recapture: the captured values (3 appointments, 8 h/10 h/13 h, 402,42 $) were taken with `TZ=America/Montreal` and are what the corrected code shows on any host. The `TZ=America/Montreal` prefix in the reproduction steps below is no longer required.

### 2. `/demo` re-check: unchanged and working
`next build` OK (`/demo` stays `○` static; `src/lib/demo-journey.ts` and `public/demo/garage-laurent/*` untouched). Served with `next start` under `env -i` (no DB/Supabase variables): `/demo` 200 while a DB page (`/book/garage-laurent-demo`) returned 500. `qa-demo-page.mjs` FR/EN x 390/768/1440: overflow 0, broken images 0 (26 images), FR/EN h1 and captions, SMS-to-invoice link opens the viewer, invoice PDF `200 application/pdf`, lightbox OK, 0 console errors, 0 cross-origin, 0 responses >= 400.

### 3. Real Supabase Storage: read-only check (project `Garage OS`, `saccjhinmeaoqoeuhljd`)
The connector exposes project/SQL/migration/branch/edge-function/log tools, but **no environment variables and no Storage object API**. The only read path used was `execute_sql` with `SELECT` on `storage.buckets`, `storage.objects` and `pg_policies`. No business table was read; nothing was written, uploaded or changed.

| Item | Result |
| --- | --- |
| Bucket `public-assets` | public, 5 MiB limit, mime png/jpeg/webp/svg |
| Bucket `accounting` (private DVI photos) | `public = false` |
| Logo `public-assets/logos/mkt-gl-v1-shop/logo.png` | exists, 562 977 B, image/png (= manifest bytes) |
| Booking images `public-assets/booking-page/mkt-gl-v1-shop/{cover,shop}-*.webp` | both exist, 251 436 B and 249 074 B, image/webp (converted, so no SHA-256 comparison possible) |
| DVI photos `accounting/mkt-gl-v1-shop/inspections/mkt-gl-v1-insp-camille/*.png` | both exist, 2 500 483 B and 2 575 208 B, image/png (= manifest bytes) |
| Access config | RLS enabled on `storage.objects` with **0 policies**: no anon/authenticated access through the Storage API; only the service role reads the private bucket; the public bucket serves by public URL |

Not verified: (a) HTTP fetch of the public URLs and of a private URL (anon must be refused): the sandbox proxy returned 403 on the Supabase host and was not bypassed; (b) byte-level SHA-256 of the stored objects (ETag is MD5; sizes match); (c) that `Shop.logoUrl` / `bookingCoverImageUrl` / `InspectionPhoto.storagePath` rows point to these objects, which lives in the business database and is not reachable from this connector. The winter-campaign image is still pending (the campaign editor is text only); no support was added.

### 4. Navigable demo shop: requirement, not done (no production shop created)
A browsable Garage Laurent admin needs a **dedicated development PostgreSQL** (local, or a non-production branch) with `DATABASE_URL`/`DIRECT_URL`, `DEMO_OWNER_PASSWORD`, `AUTH_SECRET`, then `seed:marketing-garage-laurent` and, for images, `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` of the matching Storage. The Supabase connector provides none of these. Storage objects for `mkt-gl-v1-shop` already exist (section 3), so the attach script would find them by hash. `/demo` does not depend on any of this.

## Booking replica at `/demo/booking` (PR #85)

The QR on `/demo` (booking step) now opens `https://www.garage-os.ca/demo/booking`, a **local replica of the Garage Laurent booking site**. No tenant is created in production and nothing depends on a database, Supabase or the capture server.

- **Same renderer**: `BookingPageRenderer` (the one behind `/book/[slug]`), MODERN template, MODERN typography, brand `#15363D`, the seed's 6 services (order, FR/EN/ES labels, icons, 4 featured), hours (Mon-Fri 8-17, Sat 9-13), address and phone. Data: `src/lib/demo-booking-shop.ts`; `tests/demo-booking.test.ts` fails if it drifts from the seed.
- **Same images**: `public/demo/garage-laurent/booking/{logo.png,cover.webp,shop.webp}`. Logo = the original PNG (SHA-256 equals `garage-laurent-assets-manifest.json`); cover/shop are produced with the attach script's pipeline (WebP q84, product max widths) and are **byte-for-byte the same size as the real Storage objects** (251 436 B and 249 074 B).
- **Demo mode** (`BookingDemoContext`, absent on every real route, so real behaviour is unchanged): availability comes from `src/lib/demo-booking-availability.ts` (shop hours, 60 min grid, service duration, 24 h lead time, 30-day window, all in America/Montreal; deterministic fictitious busy slots, never an empty open day); personal fields (booking and contact forms) are empty and disabled with the FR/EN/ES note; no submit button; `tel:`, WhatsApp, "Powered by GarageOS" and "Staff" links are informational. A slim notice states the shop is fictional and links back to `/demo#booking`.
- **No writes**: the page-view beacon (`POST /api/track`, stores IP and user agent) skips `/demo/booking`; the page makes 0 non-GET requests and 0 `/api/` calls (verified in Chromium). `/demo` keeps its existing beacon.
- **Visual fidelity**: with the notice and the WhatsApp button hidden, the replica matches the existing real-page captures **pixel for pixel (0.00 % differing pixels)**: `03-booking-desktop` FR/EN (2880x2000) and `04-booking-mobile` FR/EN (780x1688). `05-booking-form-mobile` differs only where intended (disabled contact fields and the note instead of "Envoyer").
- **Journey checked** (FR 1440, EN 390, FR 768): service, date, time, vehicle, customer form (5 fields disabled and empty, 0 submit buttons), then changing service resets date/time, and date/time can be changed again; no horizontal overflow; 0 console errors; 0 cross-origin requests; no `tel:`/`mailto:`/maps/`wa.me`/external links. QR (with logo) decodes to the route; the button carries the language (`?lang=`).
- Evidence: `docs/demo-journey/evidence/booking-replica-{cover,form}-*.png`.

## Pending for the next agent

1. ~~Dashboard time zone~~ resolved above.
2. **Capture shop lives in a throwaway database** (container-local PostgreSQL, gone with the container). Re-create with the seed to recapture, or provision the dev database from section 4.
3. **`/demo` is fully static** (assets + catalog only; no Supabase, database or capture server).
4. **Storage**: objects verified to exist (section 3). Still to do by someone with the keys: HTTP access test (public 200, private refused) and DB-row linkage.
5. **Winter campaign image**: pending until the campaign editor supports images.
6. Minor: INV-0009..0011 (dated earlier) are numbered after the draft INV-0008; cosmetic. EN screens show French shop records (stated on `/demo`).

## Reproducing the captures without storing credentials

Nothing below needs a secret in git; keep values in the shell session or files outside the repo.

```bash
# 1. Throwaway database (any local Postgres). Credentials exist only in this shell.
export DATABASE_URL="postgresql://<user>:<generated>@localhost:5432/garageos_marketing_local"
export DIRECT_URL="$DATABASE_URL"
npm ci && npm run db:generate && npm run db:deploy
export DEMO_OWNER_PASSWORD="$(openssl rand -hex 12)"      # not printed, not saved in the repo
npm run seed:marketing-garage-laurent -- --dry-run
npm run seed:marketing-garage-laurent -- --access-file=/tmp/gl-access.json   # outside the repo (0600)

# 2. Storage: with real credentials export NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY and run
#    `npm run attach:marketing-garage-laurent-assets` (check SHA-256 first). Without them, point the same
#    variables at a local fake Storage server (dev only) and say so in this file.

# 3. App with every provider disabled (dashboard uses Shop.timezone; no TZ needed)
export AUTH_SECRET=$(openssl rand -hex 16) AUTH_TRUST_HOST=true NEXTAUTH_URL=http://localhost:3100 \
  NEXT_PUBLIC_APP_URL=http://localhost:3100 PROVIDER_SIDE_EFFECTS=disabled STRIPE_TEST_MUTATIONS=disabled GARAGEOS_LOCAL_QA=1
npx next dev --webpack -p 3100

# 4. Tooling (outside the repo): mkdir /tmp/gl-tools && cd /tmp/gl-tools && npm init -y && npm i playwright-core sharp
export DEMO_TOOLS_DIR=/tmp/gl-tools CHROMIUM_PATH=<chromium binary> CHROMIUM_NO_SANDBOX=1 \
  DEMO_BASE_URL=http://localhost:3100 DEMO_ACCESS_FILE=/tmp/gl-access.json
node scripts/demo-journey/capture.mjs --locale=fr      # EN: see README (temporary EN locale/language, then restore)
npx tsx scripts/demo-journey/render-documents.ts /tmp/gl-docs && node scripts/demo-journey/shoot-documents.mjs /tmp/gl-docs
node scripts/demo-journey/prepare-assets.mjs && npx tsx scripts/demo-journey/build-messages.ts
# 5. Stop everything, then verify /demo statically: next build && env -i PATH="$PATH" next start, then
node scripts/demo-journey/qa-demo-page.mjs --shots=docs/demo-journey/evidence
```
