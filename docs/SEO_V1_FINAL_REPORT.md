# SEO + Resources V1 — final report

**Date of close-out:** 2026-10-14 · **Repository:** `MitchellCastellanos/GarageOS` · **Production:** https://www.garage-os.ca
**Verdict: CONDITIONAL GO** (justification in §10). Entry point for future work: [`SEO_HANDOFF.md`](./SEO_HANDOFF.md) · everything still pending: [`SEO_FUTURE_BACKLOG.md`](./SEO_FUTURE_BACKLOG.md).

> Honesty note. This report separates what was verified **locally**, on a **Vercel Preview** and on **production**, and lists what could not be verified. Nothing in the backlog is marked done because it is documented. French content is a preliminary assistant-written/reviewed version: **no native-speaker or legal review has happened**, and French pages are `noindex`.

## 1. Objective and scope of V1
A functional public V1, not a content-campaign completion: (1) a coherent EN/FR commercial site that is technically SEO-ready, (2) a working Help Center (navigation, search, essential documentation), (3) a Resources hub tying together Help, guides, blog, videos, Quick Start and changelog, (4) correct technical SEO in production, (5) a complete backlog, (6) a self-sufficient handoff. Explicitly **out of scope** (moved to the backlog): the ≈63-article Help plan, French Help articles, new blog posts, Solutions/Compare/glossary, Analytics v2 storage, Search Console/Bing/DNS/Resend/Neon actions.

## 2. Pull requests
| PR | Title | Merge commit | State |
|---|---|---|---|
| #99 | Canonical per page | `625c7ab` | merged, production verified |
| #100 | Private/token routes: robots, noindex, `Referrer-Policy`, analytics path normalisation | `007e5fe` | merged, production verified |
| #101 | EN/FR routing infrastructure | `843e304` | merged, production verified |
| #102 | French terminology (Devis / Ordre de travail) | `81ff14a` | merged |
| #104 | SEO handoff + planning docs | `2a68d9e` | merged (docs) |
| #105 | Sitemap, hreflang helper, robots `Sitemap:`, home JSON-LD | `f10a221` | merged, production verified |
| #106 | Handoff close-out (#3) | `0ffeebb` | merged (docs) |
| #107 | Plan reconcile + gap audit | `8c7d206` | merged (docs) |
| #108 | SEO CI guard + metadata hygiene (Pricing single H1) | `c43bda9` | merged, production verified |
| #109 | FR wave 1 (Produit, Fonctionnalités, Tarifs, Intégrations) as `noindex` drafts | `0987c2b` | merged, production verified |
| #110 | Analytics v2 contract + PageView dry-run instructions | `83b69ce` | merged (docs) |
| #111 | Help Center platform (typed content, categories, breadcrumbs, TOC, related; `/guides/*` canonical → Help) | `5121346` | merged, production verified |
| [#113](https://github.com/MitchellCastellanos/GarageOS/pull/113) | Help search + real 301 redirects from `/guides/*` | `101e722` | merged 2026-10-14 (order 1), production READY and verified (see §5) |
| [#114](https://github.com/MitchellCastellanos/GarageOS/pull/114) | 4 feature pages (EN indexable, FR `noindex` drafts) + FR drafts demo/commencer/contact | `e6b1527` | merged 2026-10-14 (order 2), production READY and verified |
| [#115](https://github.com/MitchellCastellanos/GarageOS/pull/115) | `/resources` hub (**stacked on #113 and #114**) | `a71c852` | merged 2026-10-14 (order 3; branch rebuilt on `main` so its diff was only the hub), production READY and verified |
| [#116](https://github.com/MitchellCastellanos/GarageOS/pull/116) | Analytics hardening (personal-looking UTM dropped, DNT/GPC honoured; no storage change) | `3a94b5e` | merged 2026-10-14 (order 4), production READY; DNT/GPC and UTM behaviour verified by tests/build only (see §5/§6) |

**Merge order followed:** #113 → #114 → #115 → #116, each synced with `main`, checked (tsc, ESLint 0 errors, tests, build), Preview READY, then merged and production deployment awaited before the next. Production deployments: #113 `dpl_AUNVEbuuPtimxw398Gx4ECFTC6zE`, #114 `dpl_B9Jfv9Sx5B2aiPWLRK9jM7odi7B6`, #115 `dpl_6ET9LFp8Rb7rmcPW3YVZszJyXkxL`, #116 `dpl_3MyFjMYokpV3inv98nEV4cDa8c8n` — all READY.
Other open PRs in the repository (#86, #82, #47, #42) are **not part of this front** (sales playbook docs, demo-journey handoff, SMS overage checkout, Google sign-in fix). Open issues from this front: #103 (RSC performance), #117 (admin login/signup a11y).

## 3. What V1 delivers
- **Technical SEO:** per-page canonical/`og:url`; `robots.txt` with all private-route rules and the `Sitemap:` line; `sitemap.xml` generated from the single route table + content sources (EN only, no private/token/`/book`/`/watch`/query/redirect URLs); `lang="en-CA"` / `fr-CA` per root layout; private/token routes `noindex` + `X-Robots-Tag` + `Referrer-Policy: same-origin`; JSON-LD limited to Organization/WebSite (home) and BreadcrumbList (Help, features); SEO CI guard (`tests/seo-*.test.ts`).
- **Commercial site (EN):** Home, Product, Features (+4 detail pages), Pricing, Integrations, Demo, Get Started, Contact, About, legal pages, Quick Start, Changelog, Resources.
- **Commercial site (FR):** home plus 11 drafts (`/fr/produit`, `/fr/fonctionnalites` and its 4 detail pages, `/fr/tarifs`, `/fr/integrations`, `/fr/demo`, `/fr/commencer`, `/fr/contact`) — all `noindex, follow`, not in the sitemap, not linked from the language switcher, no hreflang.
- **Help Center:** 7 categories, 13 articles, breadcrumbs, TOC, related articles, accessible local search (EN), `/fr/aide/…` routes ready (404 until a French article exists); the 13 historical guides map 1:1 and redirect with 301 (live since #113).
- **Resources:** `/resources` hub (Help, Quick Start, demo, features, videos only if published, blog, changelog) (live since #115).
- **Analytics:** existing first-party analytics kept; legitimate UTM and route-derived language recorded; no tokens/private paths; hardening live since #116.

## 4. Public routes and indexation
| Area | EN (indexable, in sitemap) | FR |
|---|---|---|
| Commercial | `/`, `/product`, `/features`, `/features/{online-booking, digital-vehicle-inspections, quotes-and-approvals, sms-and-email}`, `/pricing`, `/integrations`, `/demo`, `/get-started`, `/quick-start`, `/about`, `/contact`, `/privacy`, `/terms`, `/changelog` | `/fr` and 11 drafts: **noindex, follow** |
| Resources | `/resources`, `/blog`, `/blog/<3 posts>`, `/help`, `/help/<7 categories>`, `/help/<category>/<13 articles>` | `/fr/aide/**` → 404 (no French article) |
| Old guides | `/guides`, `/guides/<13>` → 301 to Help | — |
| Excluded always | private/token routes, `/book/*`, `/watch/*`, `/admin`, `/platform`, `/api`, query URLs | — |

**hreflang:** none is emitted anywhere today (correct: there is no live, indexable, reciprocal EN/FR pair). **French indexation is OFF** and remains so until the pair-by-pair publication criteria in the backlog (FR-01) are met.

## 5. Test and verification results
**Local build** (last pre-merge run on the #116 branch synced with `main` after #113–#115, equivalent to final `main`): `tsc --noEmit` clean · ESLint 0 errors (51 pre-existing warnings) · full test suite 876 total, 868 pass, 0 fail, 8 skipped (DB-gated suites) · `next build` OK.
**Rendered-HTML audit of that build (56 prerendered pages):** 43 indexable pages = exactly the 43 sitemap URLs (no extras, no missing); every indexable page has a canonical and exactly one `<h1>`; 12 FR pages all `noindex, follow` with `lang="fr-CA"`; all other pages `lang="en-CA"`; no `<link rel="alternate" hreflang>` anywhere; JSON-LD types: Organization, WebSite, BreadcrumbList only.
**Browser check on a local production server** (Playwright/Chromium, 390/820/1440 px, 22 public paths × 3 widths): HTTP 200, no horizontal overflow, one `<h1>`, one `<main>`, no images without `alt`, no duplicate ids, no unnamed buttons/unlabelled inputs. Exceptions (pre-existing, issue #117): `/admin/login` and `/admin/signup` have two `<h1>` and no `<main>`.
**Redirects (local server):** `/guides` and `/guides/<slug>` → real `301` to their Help destinations; destinations 200.
**Help search (local, 3 widths):** results, empty state and too-short state announced via `aria-live`.
**Previews:** the Vercel Preview of #113, #114, #115, #116 reached READY (build completed). Preview hosts show a stale canonical host (known, INF-01); only paths were checked there.
**Production** (www.garage-os.ca), final deployment commit `3a94b5e` (#116) READY, verified 2026-10-14 through the Vercel fetch tool (the agent sandbox cannot reach the public domain directly):
- `sitemap.xml` 200: 43 URLs, all on `https://www.garage-os.ca`; includes `/resources`, the 4 `/features/*`, `/help`, 7 categories and 13 articles; no `/fr*`, no `/guides*`, no private/token/`/book`/`/watch` routes.
- `robots.txt` 200: all Disallow rules (admin, platform, api, portal, quote, inspection, sales*, account-recovery, activate-demo, `/book/*/manage/`) and the `Sitemap:` line.
- `/guides/set-up-your-shop` → arrives at 200 on `/help/getting-started/set-up-your-shop` (canonical on `www`, BreadcrumbList, `lang="en-CA"`, one h1, related articles, "Contact us"); unknown `/guides/nope-not-real` → 404 `noindex` (no loop). **Limitation:** the fetch tool follows redirects, so the literal `301` status was not observed in production; it is asserted by `tests/help-center.test.ts` and by next.config `statusCode: 301`, and the destination was observed in production. The other 12 `/guides/*` sources were not individually fetched in production; their 13 destinations are all in the production sitemap (the 13 articles).
- `/features/online-booking` 200: one h1, own canonical, `og:url`, BreadcrumbList, CTAs to `/demo` and `/get-started`, links to Help guide, sibling features, `/pricing`; `/resources` 200: one h1, own canonical, no noindex, links to Help (9), features, blog, changelog, quick start, demo, footer/menu entry "All resources".
- `/fr/fonctionnalites/reservation-en-ligne` 200: `noindex, follow`, own canonical, `lang="fr-CA"`, no hreflang, not in sitemap; `/fr/aide/premiers-pas/configurer-votre-atelier` → 404 `noindex` (no French Help article yet).
- Not re-fetched on production in this run (verified earlier at `0987c2b`/`5121346`, unchanged code): `/pricing` single h1, `/quote/<invalid>` 404 with `X-Robots-Tag: noindex, nofollow, noarchive`.
- **Not observable from production by the tooling:** DNT/GPC behaviour of `/api/track` (needs a POST with headers) and UTM sanitization; both are covered by `tests/privacy-indexation.test.ts` (22 tests) and the build, not by a production request. Responsive widths and structural accessibility were verified on a **local production server** (Playwright 390/820/1440), not on production.

## 6. What was NOT verified (do not assume)
Lighthouse / Core Web Vitals (no tooling in the environment) · automated accessibility engine (only structural DOM checks) · login, signup, dashboard, booking and portal **flows with a database** (DB-gated suites are skipped here; unchanged code paths) · literal 301 status codes, DNT/GPC and UTM sanitization, and responsive/accessibility on the production domain itself (only the tests and the local server cover these) · Search Console/Bing (not accessed) · Resend click-tracking · real quote/portal tokens in production · `/portal/<invalid>` on production (unchanged code).

## 7. Known limitations
1. Help content is English-only (13 articles); the French interface says so on the search box.
2. French copy is preliminary; privacy/terms/pricing-renewal/STOP texts need professional approval before any indexation.
3. `/resources` has no French equivalent yet; the FR menu entry links to the EN hub.
4. The language switcher falls back to the French home for pages without a real French equivalent (by design).
5. The approval-history Help article says decisions can be reviewed in the estimate; a separate audit (sales playbook, PR #86) says no admin screen lists approvals — verify (QA-02) before expanding Help.
6. Tests/SEO guard are not wired into CI (no GitHub Actions test workflow exists); run locally before merges (backlog DOC-01).
7. Analytics: no channel classification, CTA events, signup attribution or conversion panels (Analytics v2 is designed, not built).
8. Historical `PageView` rows may still contain bearer tokens until the Neon cleanup is done (SEC-01…03) — **a security item, not SEO**.

## 8. Manual validation required (owner / external)
Search Console and Bing (domain verification by DNS, sitemap submission), native Québec review and legal review of French/legal text, Resend click-tracking OFF for transactional domains, Preview `NEXT_PUBLIC_APP_URL`, PageView dry-run in Neon, video CDN publication check, Lighthouse on production.

## 9. Residual security risk
Historical `PageView.path` rows written before #100 (≤ 30-day-old portal/quote/appointment links) may exist in Neon; new rows are clean. Procedure (read-only dry-run → decision → backed-up cleanup) is in `pageview-token-purge-runbook.md` and backlog SEC-01…03. Do not treat it as optional SEO work.

## 10. GO / CONDITIONAL GO / NO-GO
**CONDITIONAL GO.**
- *Go:* the public EN site, Help Center foundation, technical SEO and privacy protections are in production and verified; all four V1 PRs are merged, small, tested and reversible; nothing touched billing, auth, CRM, booking or migrations.
- *Conditions:* (a) **done 2026-10-14:** #113–#116 merged in order and production re-verified (limits in §5/§6); (b) French indexation stays OFF until native + legal review (so the "bilingual SEO" objective is **not** complete); (c) SEC-01…03 (PageView/Neon) are scheduled as a separate security task; (d) Search Console/Bing set up so indexing can be measured.
- *Not NO-GO because* none of the open conditions can cause harm if left as-is: French pages are noindex, redirects are idempotent, and the security residual is pre-existing and documented.
