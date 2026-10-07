# /demo journey — capture and run instructions (internal)

Plan: `docs/demo-journey-implementation-plan.md`. Public page: `/demo`, built from static assets only.

## Pieces

| Piece | Where |
| --- | --- |
| Asset catalog, copy, plan badges | `src/lib/demo-journey.ts` |
| Page + components | `src/components/marketing/demo/` (`DemoJourney`, `DemoViewer` lightbox, `DemoMessage` SMS frame) |
| Raw captures (PNG, sources) | `docs/demo-journey/captures/{fr,en}/<name>.png` |
| Web assets (WebP), static PDF | `public/demo/garage-laurent/{fr,en}/<name>.webp`, `invoice-camille.pdf` |
| Page manifest (dimensions; an asset not listed is not shown) | `public/demo/garage-laurent/manifest.json` |
| SMS strings | `public/demo/garage-laurent/messages.json` (generated, real formatters) |
| Provenance manifest | `docs/demo-journey/manifest.json` |
| Tooling | `scripts/demo-journey/` |

The 25 names are the keys of `DEMO_ASSETS` in the catalog (same as the plan table).

## Local environment (verify, do not assume)

- Dataset: `marketing-garage-laurent-v1` in local PostgreSQL `localhost:54329`, database `garageos_marketing_local`
  (`docs/marketing-garage-laurent-seed.md`). Windows starter: `C:\Users\mitch\gpg-local\start-dev.cjs` (app on :3000, local `DATABASE_URL`).
- Owner login `demo.garage.laurent@example.com`; the password is only passed through `DEMO_OWNER_PASSWORD`. Never commit it.
- Private tokens (portal, inspection report, quote approval) live in the access file outside the repo (`gpg-local/access-links.json`); pass it as `DEMO_ACCESS_FILE`.
- Images (logo, exterior, interior, 2 DVI photos) are already in Supabase Storage and linked to the shop.
- Communications stay suspended (`Shop.communicationsSuspendedAt`). Nothing here sends SMS/email.

## Tooling setup (outside the repo; not a repo dependency)

```bash
mkdir "$TEMP/gl-capture" && cd "$TEMP/gl-capture" && npm init -y && npm i playwright-core sharp
export DEMO_TOOLS_DIR="$TEMP/gl-capture"   # Chromium is taken from %LOCALAPPDATA%\ms-playwright or CHROMIUM_PATH
```

## Steps

1. Confirm the DB answers (`Server has closed the connection` / error 487 means the blocker below is still present).
2. `DEMO_OWNER_PASSWORD=… DEMO_ACCESS_FILE=… node scripts/demo-journey/capture.mjs` → PNGs + `capture-log.json`. **Not yet run**: written while the DB was blocked, expect selector/wait tweaks.
3. Documents (06, 14, 15, 16, 19, 20 and the PDF) must come from the real renderers (email templates, `generateInvoicePdf`) against the DB, without transport, then be screenshotted by element. A `render-documents` step is still to be written once the DB is reachable.
4. `node scripts/demo-journey/prepare-assets.mjs` → WebP + `public/.../manifest.json`. Use `docs/demo-journey/asset-overrides.json` for `reuseFrom` and badges (staged quote, "another sample visit").
5. `npx tsx scripts/demo-journey/build-messages.ts` regenerates `messages.json` (no DB).
6. `node scripts/demo-journey/qa-demo-page.mjs --shots=docs/demo-journey/evidence` for layout, overflow, lightbox and anchors.
7. Audit exported files for tokens/secrets; update `docs/demo-journey/manifest.json` and `validation.md`.

## Rules

Real product output only. Do not edit product UI for prettier screenshots, never alter Camille's finalized invoice, label staged or secondary examples, no fake delivery states.

## Re-running remotely (no laptop)

1. Local Postgres + `npm run db:deploy`, then `npm run seed:marketing-garage-laurent -- --access-file=<outside repo>` (see `remote-handoff.md`). Without real Storage credentials, attach the photos against a local Storage stand-in; note it in `validation.md`.
2. Start the app (`next dev --webpack`, provider keys empty, `PROVIDER_SIDE_EFFECTS=disabled`).
3. `capture.mjs --locale=fr`; for EN set the owner's `preferredLocale` to EN (and the customer/quote `language` of Camille/Alexandre) only during the run, then restore.
4. `npx tsx scripts/demo-journey/render-documents.ts <tmpDir>` then `node scripts/demo-journey/shoot-documents.mjs <tmpDir>` (needs `pdftoppm`).
5. `prepare-assets.mjs` (also copies the PDFs), `npx tsx scripts/demo-journey/build-messages.ts` (`DEMO_REF_DATE` defaults to the seed date), `qa-demo-page.mjs`.
Views 12 (approval history) and 22 (SMS inbox) have no real source and stay omitted.
