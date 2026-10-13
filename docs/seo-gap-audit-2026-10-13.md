# SEO + Resources — gap audit (2026-10-13)

Source of truth: `origin/main` @ `0ffeebb` and GitHub state on 2026-10-13. Supersedes any older "PR #3 pending" wording.

## 1. Verified state (done)

| Item | Evidence |
|---|---|
| PR #99 canonical per page, #100 private/token routes + analytics path normalisation, #101 EN/FR routing, #102 FR terminology (Devis / Ordre de travail), #104 handoff docs, #105 sitemap + hreflang helper + robots `Sitemap:` + home JSON-LD (`f10a221`), #106 handoff close-out (`0ffeebb`) | all merged; no PR after #106 exists |
| Production (www.garage-os.ca) | sitemap 32 EN URLs on the authority host, robots with Sitemap line, canonical/og:url correct, `/fr` = `noindex, follow`, private routes protected (verified 2026-10-11) |
| Route table, `alternatesFor`/`hreflangPaths`, sitemap builder, tests (`seo-sitemap`, `seo-canonical`, `i18n-routing`, `privacy-indexation`, `fr-terminology`) | in repo; 843 tests |
| Analytics beacon | `locale` already derived from the route (the "fixed en" bug is fixed); private paths never tracked |
| Sales video block / `/watch/*` (PR #96), plan data derived from `entitlements.ts` (`marketing-plans.ts`, `public-surface` test) | in repo |

## 2. What is really missing

| Area | Gap |
|---|---|
| A. FR commercial | Only `/fr` (home) exists and is noindex. The 12 other routes are `frStatus: "planned"`: no `/fr/*` files. The page components already read bilingual copy (`PRODUCT_COPY[locale]`, `marketing-pages.ts`, dictionaries), so the work is route files + metadata + Québec review + flipping `frStatus`/`frIndexable` together (sitemap + hreflang then follow automatically). Unfinished: confirm every string is native, no EN leftovers |
| B. Features | `/features` is one page. No `/features/<slug>`; the four priority pages (online booking, digital inspections, quotes & approvals, SMS & email) do not exist |
| C. Resources / Help | `/help` (partial), `/guides` (13) and `/blog` (3) are English-only static TS (`marketing-resources.ts`); no categories, search, FR, breadcrumbs, related links, redirects, contextual `HelpLink`, real dated changelog. No `/resources`, `/glossary`, `/solutions`, `/compare` |
| D. SEO content | None of the 12 planned posts / solutions / compare pages. No keyword data (no tool access) |
| E. Analytics | Missing: channel classification (organic/direct/campaign/referral), CTA click events, signup/demo source attribution record, dimensions in `/platform` analytics (language, page type, channel, top landings); privacy policy text update |
| E. Technical | JSON-LD only Organization+WebSite (no SoftwareApplication/Offer/BlogPosting by design); CI SEO guard (title/description length, unique, one H1; `/pricing` SSR has no `<h1>`); Lighthouse/CWV pass; issue #103 (`/?_rsc` slowness) open and uninvestigated |
| Security | PageView historical token cleanup on Neon **not run** (no authorised DB access); runbook + script exist |
| External (owner) | Search Console, Bing, Resend click-tracking OFF, Preview `NEXT_PUBLIC_APP_URL`, video CDN (R2) upload/publish |

## 3. Proposed PRs (small, independent, in order)

Lane A = platform/SEO, lane B = content. Max two in parallel; every PR: tsc, ESLint, full tests, build, Preview READY, then owner authorises merge, then production check.

| # | PR | Lane | Depends on |
|---|---|---|---|
| 1 | Docs reconcile + this audit (docs only) | — | — |
| 2 | **SEO CI guard + metadata hygiene** (title/desc length & uniqueness test, one H1 per public page incl. `/pricing`, JSON-LD parse test) | A | — |
| 3 | **Analytics v2**: channel classification, CTA events (`demo`, `signup`, `pricing`, `watch_play`), signup/demo source record (no cookies, no tokens), `/platform` analytics dimensions; privacy-policy text (EN/FR) | A | owner OK on D13 wording |
| 4 | **FR commercial pages wave 1**: `/fr/produit`, `/fr/tarifs`, `/fr/fonctionnalites`, `/fr/integrations` (+ home complete) with metadata; flags stay `planned` until validated | B | Québec reviewer (D18) |
| 5 | **FR wave 2** + go-live: `/fr/demo`, `commencer`, `demarrage-rapide`, `a-propos`, `contact`, `confidentialite`, `conditions`, `nouveautes`; flip `live` + indexable (incl. `/fr` home) → sitemap + reciprocal hreflang; production check | B | #4, reviewer sign-off, legal read of FR privacy/terms |
| 6 | **Features hub + 4 detail pages EN/FR** (`/features/online-booking`, `digital-vehicle-inspections`, `quotes-and-approvals`, `sms-and-email`), plan gates from `CAPABILITY_MIN_PLAN`, SMS figures from constants, CTAs to `/demo`, signup, related pages | B | #5 pattern |
| 7 | **Help platform**: typed TS content schema, renderer (breadcrumbs, TOC, related), categories, EN/FR parity checks; `/help` rebuilt | A | #5 |
| 8 | **Help search** (per language, keyboard/ARIA, empty states) | A | #7 |
| 9 | **Help content waves** (P0/P1, ~8 articles per PR, EN+FR, claims traced to code/UI dictionaries; remove stale guide text) — several PRs | B | #7 |
| 10 | **Redirects `/guides/*` → Help**, hub `/resources`, contextual `HelpLink` in the panel, video slots (reusing `/watch` CDN assets) | A/B | #9 |
| 11 | **Blog bilingual** (real dates, author, `BlogPosting`) + pillar post; then educational waves (3–4 per PR, cited sources) | B | #5, keyword priorities |
| 12 | **Solutions** (6 pages) and **Compare** hub with "vs spreadsheets/paper" only; competitor pages only with verified official sources | B | #6, D12, legal |
| 13 | **Real dated changelog** EN/FR | B | D7 |
| 14 | **Issue #103** diagnosis on a Preview/production; fix only if isolated and regression-free, else a written plan | A | — (can run any time) |
| 15 | **Final close-out**: Lighthouse/a11y/responsive pass, sitemap/hreflang/JSON-LD audit in production, manual checklist, handoff + master plan | A | all |

Security task (no PR unless a script change is needed): PageView dry-run on Neon once you give an authorised read-only path; `--apply` only with your explicit instruction and a backup/PITR point.

## 4. Decisions needed from the owner

1. **Québec native reviewer** (D18): who validates FR copy before any `/fr/*` becomes indexable; and a legal read of FR privacy/terms.
2. Approve the **analytics v2** scope and privacy-policy wording (D13): source record at signup/demo, no cookies.
3. Help URL structure (D4: `/help/<category>/<slug>` + 301 from `/guides`) and content in typed TS (D6): confirm.
4. Changelog starting point (D7); scope/reviewer for **comparisons** (D12) and legal review (D8).
5. `/watch/*` in the sitemap? (currently excluded); `/book/[slug]` stays out (decided).
6. Video CDN (R2 + `video.garage-os.ca`) approval and upload — needed for contextual videos (PR 10).
7. Access path for the **Neon PageView dry-run** (read-only credential run by you, or you run the script and share counts).
8. Whether I may file the Preview env fix as a code change (derive host from `VERCEL_URL` in Preview) instead of you editing the variable.
9. Priorities for blog topics (D16/D17: no keyword tool; use Search Console data after launch or give me a list).

## 5. Risks / blockers

- No access to external sites or SERP data from this environment: competitor facts, keyword volumes, Québec SERP cannot be verified here (no invented numbers; comparisons wait for sources you provide or approve).
- FR indexation is the biggest SEO risk: turning pages live before native review hurts quality; flags make it a one-line, test-covered switch.
- Wrong host on Previews (`NEXT_PUBLIC_APP_URL`) can mislead host checks; only paths verifiable there.
- Vercel Preview build occasionally fails on the Oswald font fetch: one redeploy of the same commit.
- Separate root layouts: EN↔FR switch is a full page load (accepted).
- Volume: ~125 URLs per language; content waves need review capacity, so they ship in small, independently mergeable PRs.
- Issue #103 root cause unknown; may need production profiling I cannot do from here.
- No changes to DNS, Search Console, Bing, Resend, env vars, migrations, billing, auth, CRM or booking logic are planned in any PR above.
