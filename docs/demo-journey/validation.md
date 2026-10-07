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

## Not done / limits

- Real Supabase Storage was not written; if the shop's cloud demo needs the images, the owner must run the attach script with the real Storage env (hashes match the manifest).
- Production/Preview data not used; nothing deployed or merged.
