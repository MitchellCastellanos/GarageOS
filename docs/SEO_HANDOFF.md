# SEO + Resources program — HANDOFF (entry point)

> **Update 2026-10-22:** statuses were reconciled against `main` — see the table at the top of [`SEO_FUTURE_BACKLOG.md`](./SEO_FUTURE_BACKLOG.md) ("Reconciliation 2026-10-22") and the test/CI baseline in [`testing.md`](./testing.md). Where this file disagrees (e.g. Resend click tracking, SMS overage #47, "no CI"), the backlog table wins.

> **Executive summary (2026-10-14).** SEO + Resources **V1 is closed conditionally (CONDITIONAL GO)** — see [`SEO_V1_FINAL_REPORT.md`](./SEO_V1_FINAL_REPORT.md). Everything not done, with priorities, acceptance criteria and dependencies, is in [`SEO_FUTURE_BACKLOG.md`](./SEO_FUTURE_BACKLOG.md). **Read those two files before anything else; this file is the map.**
>
> - **Works in production** (verified on www.garage-os.ca): per-page canonicals; `robots.txt` with all private-route rules and the `Sitemap:` line; sitemap on the authority host; private/token routes `noindex` + `Referrer-Policy: same-origin`; EN/FR routing with `lang` `en-CA`/`fr-CA`; Pricing single H1; four French draft pages (`noindex`); Help Center platform (7 categories, 13 articles, breadcrumbs, TOC, related); `/guides/<slug>` canonical → Help article.
> - **Merged 2026-10-14 (in order) and production deployments READY:** [#113](https://github.com/MitchellCastellanos/GarageOS/pull/113) `101e722` Help search + real 301s from `/guides/*`; [#114](https://github.com/MitchellCastellanos/GarageOS/pull/114) `e6b1527` four feature pages (EN indexable, FR `noindex`) + FR drafts demo/commencer/contact; [#115](https://github.com/MitchellCastellanos/GarageOS/pull/115) `a71c852` `/resources` hub; [#116](https://github.com/MitchellCastellanos/GarageOS/pull/116) `3a94b5e` analytics hardening (personal-looking UTM dropped, DNT/GPC). Production checklist run; see the report §5 for what was and was not observable.
> - **Not done (P0/P1 headline):** PageView historical cleanup in Neon (**security, separate from SEO**: SEC-01…03), Resend click-tracking OFF (INF-02), Search Console/Bing (SEO-01/02), native Québec review and legal review (LANG-01/02), French publication pair by pair (FR-01), Analytics v2 (PRD-01…04, SEC-04), CI for tests (DOC-01), issue #103 (PERF-01), Lighthouse/CWV (PERF-02), Help expansion and French Help (CNT-01/02), DB-backed regression run (QA-04), Help claim verification (QA-02).
> - **French indexation is OFF.** Every `/fr/**` page is `noindex, follow`, out of the sitemap, with no hreflang. Do not enable it without LANG-01/LANG-02 and the pair-by-pair procedure in FR-01.
> - **How to resume:** open `SEO_FUTURE_BACKLOG.md`, take tasks in the "Recommended execution order", and use the prompt at the end of this file.
> - **Do NOT re-implement:** canonicals, robots/sitemap generation, noindex/privacy headers, EN/FR routing and root layouts, French terminology guard, SEO CI guard, Help platform/search/redirect machinery, feature pages, `/resources`, analytics UTM/DNT/GPC hardening (full list at the end of the backlog).

Original handoff written 2026-10-10; rewritten at V1 close-out so that nothing below claims a merged PR is still missing. Statements are marked **verified** only if checked; otherwise *not verified*. Repo: `MitchellCastellanos/GarageOS`. Owner speaks Spanish; code and docs are in an English/Spanish mix (new docs in English).

## 1. Program objective

GarageOS (auto-shop management SaaS, Canada) must become a **national, bilingual (EN-CA / FR-CA) commercial site that ranks organically**, and its Resources / Help Center must be renovated:

- Motor A: commercial pages (Product, Features, Pricing, Integrations, Demo, Get started…) in EN and FR.
- Motor B: Help Center (bilingual, ≈63 articles planned), quick start, changelog (real, dated).
- Motor C: educational/SEO content (blog, guides) and verified comparisons.
- Technical SEO with **indexation safety**: private/token routes never indexed or leaked; canonical per page; hreflang only for real equivalents; sitemap from a single route table.
- Privacy first: first-party analytics only, **no Google Analytics, no tracking cookies**.
- Brand colours: #07182F, #1769FF, #2583FF, #F8FAFC, #FFFFFF.

## 2. Approved decisions (summary; full list D1–D15 in `seo-master-plan.md`)

- Terminology: FR module **"Devis"** (masculine, invariable plural) is the official name; **"Soumission"** may be used as commercial/educational synonym where natural. FR **"Ordre de travail"** (synonym "bon de travail" allowed in educational text). EN panel module is **"Quotes"**; "estimate(s)" may still appear naturally in educational/commercial copy — never replace automatically. Counter staff use role Mechanic (roles: Owner/Mechanic/Viewer).
- Languages: EN at the current paths; FR under `/fr/…` with approved slugs: `produit, fonctionnalites, tarifs, integrations, demo, commencer, demarrage-rapide, a-propos, contact, confidentialite, conditions, nouveautes, aide`.
- Language selector: visible EN | FR, real `<a hreflang>` links to the equivalent page, explicit fallback (equivalent → nearest ancestor → locale home), **no** permanent "Voir en français" banner, **no** automatic redirect by browser language. Login/signup keep an in-place preference (localStorage `marketing-locale`, then `navigator.language`). The public switcher does not touch dashboard/user language preferences (verified locally).
- Architecture: **separate root layouts** `(site)` (EN) and `(fr)` — rationale and comparison in [`seo-i18n-architecture-decision.md`](./seo-i18n-architecture-decision.md). `<html lang>`: **`en-CA`** for the English site (also wraps dashboard/internal routes; harmless), **`fr-CA`** for French pages.
- Domain authority: `https://www.garage-os.ca` (apex 308 → www). Canonicals are absolute on that host via `src/lib/seo/site.ts`.
- `/fr` is `noindex, follow` until French pages are complete and approved. French pages are non-indexable until `frStatus: "live"` and `frIndexable` in the route table.
- `/book/[slug]` shop pages are **not** in the sitemap.
- SMS facts (for pricing copy): units are segments; plan limits 300/1000/2500; overage CAD 0.05 per segment; UTC calendar month; owner alerts at 80%/100%; sending never blocked. Core plan limited to 3 users. Derive numbers from constants, never hard-code in copy.

## 3. Standing constraints (do not violate)

No merge or production deploy without the owner's authorization (the owner explicitly authorized specific merges, all done). No DNS changes. No Search Console / Bing / Resend changes in code sessions (manual, owner, at the end). Do not revoke tokens indiscriminately. Do not decrypt Vercel env values. Do not run production data cleanup. No Google Analytics. Do not edit applied migrations. Do not regenerate French videos automatically. Keep CRM/internal docs out of the public Help. Do not change commercial logic/permissions/billing to fit docs; report product inconsistencies as separate findings. Demo-form study (D14) is a future separate PR, not implemented. Max two agents in parallel, only without dependencies. Each PR: tests, route review, `tsc`, ESLint, build, Preview READY. **Never push an empty commit or close/reopen a PR to kick CI**; the Vercel Preview build occasionally fails on the Oswald Google-font fetch — redeploy the *same* commit once.

## 4. State of the work (verified against git/GitHub/Vercel on 2026-10-13)

`main` includes everything through PR #116 (`3a94b5e`) plus the close-out docs PR. Merge commits: #99 `625c7ab` · #100 `007e5fe` · #102 `81ff14a` · #101 `843e304` · #104 `2a68d9e` · #105 `f10a221` · #106 `0ffeebb` · #107 `8c7d206` · #108 `c43bda9` · #109 `0987c2b` · #110 `83b69ce` · #111 `5121346` · #113 `101e722` · #114 `e6b1527` · #115 `a71c852` · #116 `3a94b5e`. Full table and verification evidence: [`SEO_V1_FINAL_REPORT.md`](./SEO_V1_FINAL_REPORT.md) §2, §5.

No PRs of this front remain open. Open PRs *not* part of this front: #86 (sales playbook docs), #82 (demo-journey handoff), #47 (SMS overage checkout), #42 (Google sign-in fix). Open issues of this front: #103 (RSC prefetch performance), #117 (admin login/signup a11y).

Production notes: `curl` from the agent sandbox to the public domain is blocked by the proxy — use the Vercel fetch tool (`web_fetch_vercel_url`); Preview deployments carry a stale canonical host (INF-01) and Vercel's own `noindex`, so only paths are verifiable there.

### After merging #113–#116 (verification checklist — executed 2026-10-14; items 3, 5 (search typing), and the DNT/GPC/UTM behaviour were only partially observable in production, see report §5)
1. Production deployment READY on the merge commit (Vercel project `prj_fliI0WW7l5wBmrAwfKyMNe3f24ZF`, team `team_ZCF5BCM7w7eiMpAFtvIXKNf0`).
2. `https://www.garage-os.ca/sitemap.xml` → 200, all URLs on `https://www.garage-os.ca`, includes `/resources`, `/features/*`, Help URLs; no `/guides*`, no `/fr*`.
3. `/guides` and `/guides/work-orders` → 301 to `/help` and `/help/run-the-shop/work-orders`; destinations 200.
4. `/features/online-booking`: 200, one `<h1>`, own canonical, BreadcrumbList, CTAs to `/demo` and `/get-started`; `/fr/fonctionnalites/reservation-en-ligne`: `noindex, follow`.
5. `/help` search works (type "booking"); `/resources` 200; `robots.txt` unchanged with `Sitemap:`.
6. `/quote/<invalid>` still 404 with `X-Robots-Tag: noindex, nofollow, noarchive`.
7. Update the statuses in `SEO_V1_FINAL_REPORT.md` §2/§5 and in `SEO_FUTURE_BACKLOG.md` (SEO-06, PRD-01 notes, "Do NOT re-implement").

## 5. Code map (what exists)
- **Route table / SEO core:** `src/lib/seo/routes.ts` (`PUBLIC_ROUTES`, `ROUTE_FAMILIES`, `frStatus` live|planned|none, `frIndexable`, `redirectTo`, `matchRoute`, `switchTarget`, `localizeHref`, `isIndexablePath`, `hreflangPaths`), `site.ts` (`getSiteUrl`, `canonicalUrl`, `alternatesFor`), `metadata.ts` (`pageMetadata`, optional `canonicalPath`), `sitemap-entries.ts`, `src/app/sitemap.ts`, `src/app/robots.ts`, `json-ld.ts` (Organization, WebSite, BreadcrumbList), `html-lang.ts`, `switch-params.ts`.
- **Layouts/i18n:** `src/app/(site)/layout.tsx` (EN root), `src/app/(fr)/layout.tsx`; `src/components/root/RootShell.tsx`; marketing components in `src/components/marketing/` (`MarketingLocaleProvider`, `LocaleLink`, `LanguageToggle`, `FeaturePageView`, …); copy in `src/lib/marketing-{locale,pages,plans,flow,pricing}.ts`.
- **Help Center:** `src/lib/help/{types,categories,articles,legacy-map,legacy-redirects,search,index}.ts`, `src/components/help/{HelpViews,HelpBreadcrumbs,HelpSearch}.tsx`, routes `src/app/(site)/help/**` and `src/app/(fr)/fr/aide/**`; guide text lives in `src/lib/marketing-resources.ts` (single source). Redirects in `next.config.ts` (`statusCode: 301`).
- **Feature pages:** `src/lib/feature-pages.ts` (+ routes under `features/` and `fr/fonctionnalites/`).
- **Privacy/analytics:** `src/lib/privacy/{private-paths,opt-out}.ts`, `next.config.ts` headers, `src/components/AnalyticsBeacon.tsx`, `src/app/api/track/route.ts`, `src/lib/platform/analytics.ts`, `scripts/redact-pageview-private-paths.ts`.
- **Tests (SEO-relevant):** `tests/seo-canonical`, `seo-sitemap`, `seo-rendered` (needs a build), `seo-fr-wave1` (lock on FR drafts, `APPROVED` list), `features-pages`, `help-center`, `i18n-routing`, `privacy-indexation`, `fr-terminology`, `public-surface`.
- **Commands:** `npx tsc --noEmit`; `npx eslint src tests`; `npx tsx --test tests/*.test.ts`; `npx next build` (placeholder env: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`); `npx prisma generate` after schema changes. Last integrated local run: 876 tests, 868 pass, 0 fail, 8 skipped (DB-gated).
- **Hosting IDs:** Vercel team `team_ZCF5BCM7w7eiMpAFtvIXKNf0`, project `prj_fliI0WW7l5wBmrAwfKyMNe3f24ZF`. Production DB is Neon; Supabase is storage only.

## 6. Document map
| Document | Purpose |
|---|---|
| `SEO_V1_FINAL_REPORT.md` | V1 scope, PRs, results, limitations, verdict |
| `SEO_FUTURE_BACKLOG.md` | Every pending task, prioritised, with acceptance criteria |
| `seo-master-plan.md` | Original plan, decisions D1–D15, keyword/competitor analysis (historical; the backlog supersedes its PR matrix) |
| `seo-gap-audit-2026-10-13.md` | Audit that scoped V1 |
| `analytics-v2-contract.md` | Approved-in-concept design for Analytics v2 (nothing built; §10 binding adjustments) |
| `pageview-token-purge-runbook.md` | PageView historical cleanup procedure (§6 = read-only dry-run) |
| `fr-wave1-review.md`, `fr-terminology-review.md` | Preliminary FR review (not native, not legal) and terminology rationale |
| `seo-manual-checklist.md` | External/manual items (Search Console, Bing, Resend, …) |
| `seo-indexation-policy.md`, `seo-i18n-architecture-decision.md` | Policies/decisions |
| `resources-renovation-plan.md`, `resources-audit-2026-10.md` | Help Center plan (Annex A: ≈63 articles) and audit of outdated Resources |
| `seo-pr3-proposal.md`, `seo-round-2-plan.md` | Historical specs (implemented) |
Branch `claude/resources-renovation` is obsolete and based on an older `main`: **never merge it**.

## 7. Owner decisions on record (2026-10-14)
Help URLs `/help/<category>/<slug>` and `/fr/aide/<categorie>/<slug>`, typed TS content, 301 from `/guides/*`; changelog starts at the first Git-verifiable release; comparisons start with spreadsheets/paper/manual (named vendors need current official sources + review); `/watch/*` stays out of the sitemap; reuse the existing R2 videos/thumbnails (no new infrastructure or DNS); Preview host: a code fix may be proposed but never `VERCEL_URL` as a production canonical, and Preview stays `noindex`; blog priorities: online booking, digital inspections, quotes/estimates/approvals, maintenance reminders, customers and work orders, Excel vs shop software, SMS/email communication, shop productivity (EN/FR national, no invented volumes or capabilities); Analytics v2 approved in concept (columns `channel`/`pageType`, `AnalyticsEvent`, `SignupAttribution`→Shop, 8 CTA ids, DNT/GPC, ≤13-month retention with verifiable purge) but **no migration/storage authorised yet**; French review is preliminary only — no claim of native or legal review.

## 8. Risks
Switching language is a full page load (separate root layouts, accepted); publishing a French page without its pair or without review; hreflang pointing to fallbacks or noindex pages; Québec garage terminology ("soumission", "bon de travail") vs the chosen "Devis"/"Ordre de travail"; `noindex` is not a security control (token URLs are protected by the token, `Referrer-Policy` and `X-Robots-Tag`); Vercel Preview Oswald font flake; local Turbopack symlink panic (use a real `node_modules`); stale Prisma client after pulling schema changes; do not trust "verified" claims older than the date of this file.

## 9. Standing constraints
No merge or production deploy without the owner's authorization for functional PRs (docs-only PRs may be merged when clean and green). No DNS changes. No Search Console / Bing / Resend / Neon / environment-variable changes by agents. Do not revoke tokens indiscriminately. Do not decrypt Vercel env values. No production data cleanup without explicit instruction. No Google Analytics or tracking cookies. Do not edit applied migrations. Do not regenerate French videos automatically. Keep CRM/internal docs out of the public Help. Do not change commercial logic/permissions/billing to fit docs. Max two agents in parallel. Each PR: tests, route review, `tsc`, ESLint, build, Preview READY. Never push an empty commit or close/reopen a PR to kick CI.

## 10. Prompt to resume the backlog (reusable)
```
You are continuing the SEO + Resources program of MitchellCastellanos/GarageOS (production: https://www.garage-os.ca).
1. Sync with origin/main. Read, in order: docs/SEO_HANDOFF.md, docs/SEO_V1_FINAL_REPORT.md, docs/SEO_FUTURE_BACKLOG.md.
2. Verify the real state (GitHub PRs/issues, git log, production) before trusting any status in the docs; if a PR listed as open is merged, update the docs first.
3. Take the next task from "Recommended execution order" in the backlog (respect dependencies and the P0→P3 order). Do not re-implement anything under "Do NOT re-implement".
4. Work in small PRs on a new branch from origin/main. Run `npx tsc --noEmit`, `npx eslint src tests`, `npx tsx --test tests/*.test.ts`, and `next build` (placeholder env), then the rendered SEO tests. Open the PR, verify the Vercel Preview, and WAIT for the owner's authorization before merging any functional PR (docs-only PRs may be merged when clean and green).
5. Never touch DNS, Search Console, Bing, Resend, Neon or environment variables, never edit applied migrations, never change billing/auth/CRM/booking logic, and never publish French pages as indexable without the review and pair-by-pair steps in FR-01. Do not invent numbers, testimonials, competitor claims or product capabilities.
6. When a task is finished and verified, update its status in the backlog, the PR table in the report, and this handoff. Do not mark a task done because it is documented.
Max two agents in parallel. Report what you verified locally, on Preview and on production separately.
```
