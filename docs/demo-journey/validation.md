# /demo journey — implementation evidence

Date: 2026-10-07. Branch: `launch-agent-6/demo-journey-handoff` (PR #82; includes the seed/asset handoff).

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
- Seed dates are relative to 2026-10-07 (demo day 2026-10-08). The dashboard's "today" and monthly revenue therefore show 0; the agenda carries the visible bookings.
- SMS compositions regenerated with reference date 2026-10-07 so they match the confirmation email (Thu 8 Oct).

## Checks

- `npx tsc --noEmit`: clean. `npm test` (clean env): 596/596. (Two `auth-claims` tests fail only if AUTH_* env vars of the capture session are exported; unrelated.) ESLint on touched demo/email files: clean.
- `npx next build`: OK (`/demo` static).
- `/demo` QA (`qa-demo-page.mjs`, production build), FR/EN × 390/768/1440: horizontal overflow 0, broken images 0 (26 images), anchors land below the sticky header, lightbox opens / full-size toggle / Escape / focus returns, invoice SMS link opens the viewer, zero console errors. Mobile, tablet and desktop were also inspected by eye.
- Secret sweep: owner password, DB password and all private tokens searched across `docs/`, `public/`, `scripts/` (text and binary): no hits. `capture-log.json` stores route templates only. PDF metadata: title/author (shop name) only.
- Evidence: `docs/demo-journey/evidence/demo-{fr,en}-{390,1440}.png` (full page; sticky header repeats mid-page in full-page screenshots).

## Not done / limits

- Real Supabase Storage was not written; if the shop's cloud demo needs the images, the owner must run the attach script with the real Storage env (hashes match the manifest).
- Production/Preview data not used; nothing deployed or merged.
