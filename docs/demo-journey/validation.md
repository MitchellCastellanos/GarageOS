# /demo journey — implementation evidence

Date: 2026-10-06. Branch: `launch-agent-6/demo-journey`.

## Verdict

**Page, catalog, components, SMS compositions and tooling: done. Real captures: 0 of 25 produced (blocked).**
`/demo` ships in an honest "assets pending" state: sections show copy and the real-formatter SMS examples; no screenshot is shown until a real one is listed in `public/demo/garage-laurent/manifest.json`. Nothing fake or broken is published.

## Blocker (precise)

- The local PostgreSQL (`C:\Users\mitch\gpg-local\data`, PID 35656, `localhost:54329`) is up and listening, but **every connection is dropped**.
  `gpg-local/server.log` has 73 lines `could not reserve shared memory region … error code 487`; a direct `pg` connection returns `ECONNRESET`; the app login fails with Prisma `P1017 ConnectionClosed` (`/api/auth/login`).
- Not touched, by instruction: no restart, no config change, no new database, no production/Preview DB. Likely fix for the owner (not done here): restart the postmaster (error 487 is a per-process address-space collision on Windows), then run `scripts/demo-journey/capture.mjs`.
- The owner password was not in the environment; the proposed value from the seed doc was only tried against local login and never written anywhere.
- `AGENTS.md` does not exist in this repo (searched root and `origin/main`); only `node_modules/recharts/AGENTS.md`. Nothing from it could be applied.

## Done

| Item | State |
| --- | --- |
| `docs/demo-journey-implementation-plan.md` | Brought in from `origin/main` on a new branch off `origin/main`; pending local work left untouched and uncommitted |
| `/demo` rebuilt: hero, jump nav, 7 sections, final CTA (trial / pricing / contact) | Done, FR + EN, static only |
| Catalog `src/lib/demo-journey.ts` (25 assets, captions/alts FR+EN, plan badges from `entitlements`) | Done |
| Lightbox (native modal dialog: Escape, focus trap/return, full-size/fit toggle, localized) | Done, verified |
| SMS frame + SMS → arrow → document composition, stacks vertically on mobile | Done (destination renders once its asset exists) |
| `messages.json` (confirmation, quote, ready, invoice, maintenance, FR + EN) | Generated from the real formatters (`src/lib/sms.ts`, 5 `*_COPY` maps now `export`ed, no behaviour change). Totals from the verified dataset plan (Camille 423.11, Alexandre 218.45 CAD); **not read from the DB**. Links are static `garageos.com/demo#…` targets, no tokens |
| Capture/preparation tooling | `capture.mjs` **written, not run**; `prepare-assets.mjs` and `qa-demo-page.mjs` written; `build-messages.ts` run |
| Homepage/Product/Features | Untouched |

## Verification run

- Layout QA (`qa-demo-page.mjs`), FR/EN × 390/768/1440: horizontal overflow 0, broken images 0, anchors land below the sticky header, lightbox opens, full-size toggle works, Escape closes, focus returns, invoice SMS link opens the viewer. Done once with throwaway placeholder images (rotulated "LAYOUT TEST", deleted, never committed) to exercise the image paths, and again in the final empty state.
- Placeholder run also exercised `reuseFrom` and `badge` manifest fields.
- `npx tsc --noEmit`: clean. `npm test`: 596/596. ESLint on new/changed files: clean. `npx next build`: OK (`/demo` static).
- Secret sweep over new files: clean (no password, JWT, service key). No tokens in `messages.json`.
- Evidence: `docs/demo-journey/evidence/demo-{fr,en}-{390,1440}.png` (full page, **empty-assets state**; they must be retaken after captures land). 768px was checked by script only.

## Not verified / still to do once the DB answers

1. Run `capture.mjs` (25 views minus documents), render documents 06/14/15/16/19/20 and `invoice-camille.pdf` from the real renderers, `prepare-assets.mjs`, update both manifests, visually inspect each image.
2. Decide Camille's approval composition: staged snapshot vs Alexandre (218.45 CAD) labelled as another sample; set badges through `asset-overrides.json`.
3. 22 (SMS inbox) stays omitted unless a compatible conversation exists (seed doc: none).
4. Re-run QA and retake evidence with real images (check 500 KB budget and text legibility).

## Missing assets (all 25 + PDF)

01–25 and `invoice-camille.pdf` (fr/en): blocked by the DB. Raw PNG folders are empty by design.

## Caveats

- The product's SMS formatters format amounts/dates with `fr-CA` even in English messages; shown as-is.
- `scripts/demo-journey/build-messages.ts` imports `scripts/marketing/garage-laurent-dataset.ts` (pure plan from the earlier seed work); that file is included in the commit because the generator needs it. The rest of the seed work (`seed-…ts`, tests, doc, `package.json`, `Garage Laurent/` images) is left uncommitted.
