# SEO + Resources program — HANDOFF (entry point)

Written 2026-10-10 at the end of a Claude Code session so that Codex, another agent or a new Claude session can continue without the conversation history. **Read this file first**, then the linked documents. Repo: `MitchellCastellanos/GarageOS`. Owner speaks Spanish; code and docs are in English/Spanish mix (new docs in English). Statements below are marked **verified** only if they were actually checked; anything else is marked *not verified*.

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

## 4. Exact implementation state (verified against git/GitHub/Vercel)

`main` HEAD after PR #3: **`f10a221`** (merge of PR #105, 2026-10-11). Previous reference points: `843e304` (PR #101), `2a68d9e` (docs PR #104).

| PR | Title | Merge commit on main | State |
|---|---|---|---|
| #99 | Canonical per page (removed global canonical) — `src/lib/seo/{site,metadata}.ts` | `625c7ab` | merged, verified in production earlier |
| #100 | Private/token routes: robots, noindex + `X-Robots-Tag`, `Referrer-Policy: same-origin`, analytics path normalisation (`src/lib/privacy/private-paths.ts`) | `007e5fe` | merged, verified in production |
| #102 | French terminology (Soumission→Devis, Bon→Ordre de travail) + guard test `tests/fr-terminology.test.ts` + `fr-terminology-review.md` | `81ff14a` | merged |
| #101 | EN/FR routing infrastructure (route groups, `RootShell`, route table, switcher, `lang` en-CA/fr-CA, utm carry-over) | `843e304` | merged |
| #105 | PR #3: sitemap.xml, hreflang helper (`alternatesFor`), robots `Sitemap:` line, home JSON-LD | `f10a221` | merged 2026-10-11, production verified (see below) |
| issue #103 | Perf: `GET /?_rsc=…` hangs 7–30 s on revisits of `/` (pre-existing, reproduced on old `main`) | — | open, separate |

**PR #3 (sitemap + hreflang + robots `Sitemap:` + home JSON-LD): MERGED** as [#105](https://github.com/MitchellCastellanos/GarageOS/pull/105), merge commit **`f10a221`**, owner-authorized 2026-10-11. Pre-merge: tsc clean, ESLint 0 errors, 843 tests (836 pass / 0 fail / 7 skipped), `next build` OK, Preview READY, PR `clean`. **Production verified** (deployment `dpl_2XXKJ8NaAcN78YwZBGK8USpDCBbJ`, READY, aliased to `www.garage-os.ca`, via Vercel fetch tool):
- `https://www.garage-os.ca/sitemap.xml` → 200, 32 URLs, **all exactly `https://www.garage-os.ca/...`** (16 EN pages + 13 guides + 3 blog posts); no `/fr`, `/book`, `/watch`, private/token routes or query strings; no `hreflang` (no real FR pair exists yet).
- `robots.txt` → 200, all previous `Disallow` rules intact + `Sitemap: https://www.garage-os.ca/sitemap.xml`.
- Canonical and `og:url` correct for `/`, `/pricing`, `/help`, `/blog` (host `www.garage-os.ca`, `lang="en-CA"`, no robots meta). Home canonical is serialized by Next as `https://www.garage-os.ca` (no trailing slash) while the sitemap lists `https://www.garage-os.ca/`; these are the same URL (root path), not a contradiction. `/` carries JSON-LD (Organization + WebSite).
- `/fr` → `lang="fr-CA"`, `noindex, follow`, canonical `https://www.garage-os.ca/fr`, absent from sitemap.
- `/quote/<invalid>` and `/portal/<invalid>` → 404 with `X-Robots-Tag: noindex, nofollow, noarchive`, `Referrer-Policy: same-origin`, robots meta `noindex, nofollow, nocache`.
- **Not verified live:** canonical/robots meta of every one of the 32 sitemap URLs individually (only the 4 above fetched; the rest rely on `tests/seo-sitemap.test.ts`, which asserts each sitemap URL is indexable and not private); real quote/portal flows with valid tokens; Search Console/Bing (manual, owner).

**Program progress after the 2026-10-13 audit** (audit: [`seo-gap-audit-2026-10-13.md`](./seo-gap-audit-2026-10-13.md)):
- #107 docs reconcile — merged. #106 handoff — merged.
- [#108](https://github.com/MitchellCastellanos/GarageOS/pull/108) SEO CI guard + metadata hygiene (Pricing single H1, EN-only metadata, `tests/seo-rendered.test.ts`) — **merged `c43bda9`** (owner-authorized 2026-10-13).
- [#109](https://github.com/MitchellCastellanos/GarageOS/pull/109) FR wave 1 (`/fr/produit`, `/fr/fonctionnalites`, `/fr/tarifs`, `/fr/integrations`) as **noindex drafts** (`frStatus: planned`, lock in `tests/seo-fr-wave1.test.ts`, preliminary review `fr-wave1-review.md`) — **merged `0987c2b`** (owner-authorized 2026-10-13); still `noindex, follow`, not in the sitemap, no indexable hreflang; FR indexation remains OFF pending linguistic validation.
- **Production verified 2026-10-13** (deployment `dpl_D1xuhwyk2JP4p1eprnQSQp2jXUZE`, commit `0987c2b`, aliased to `www.garage-os.ca`; docs-only merge `83b69ce` (#110) deployed after): `/sitemap.xml` 200, 32 URLs all `https://www.garage-os.ca/…`, no `/fr`; `/robots.txt` keeps all Disallow rules + `Sitemap:` line; `/pricing` one `<h1>`, canonical own, EN metadata; `/help` one `<h1>`; `/fr/produit`, `/fr/integrations`, `/fr/tarifs`, `/fr/fonctionnalites` → 200, `lang="fr-CA"`, `noindex, follow`, own canonical, one `<h1>`, no hreflang alternates, absent from the sitemap; `/quote/<invalid>` 404 with `X-Robots-Tag: noindex, nofollow, noarchive` and `Referrer-Policy: same-origin`. Not re-verified: `/portal/<invalid>` (unchanged code), real token flows.
- **Help Center platform PR** (typed content in `src/lib/help`, `/help/<category>/<slug>`, `/fr/aide/<categorie>/<slug>` (404 until an FR article exists, noindex), breadcrumbs + TOC + related, `buildSearchIndex(locale)` ready for the search PR, equivalence map for all 13 guides, `/guides/<slug>` → canonical to its Help article but NOT redirected yet) — see its PR; awaiting owner authorization. Next Help steps: search UI, FR articles, then 301 redirects from `/guides/*` using `GUIDE_TO_HELP`/`helpPathForGuide`.
- Analytics v2: design approved in concept (columns `channel`/`pageType`, `AnalyticsEvent`, `SignupAttribution`→Shop, 8 CTA ids, DNT/GPC, 13-month retention with verifiable purge); [`analytics-v2-contract.md`](./analytics-v2-contract.md) §10 holds the owner's binding adjustments. **No migration/storage authorised yet** — implementation PR needs its own authorization.
- PageView Neon dry-run: concrete read-only instructions in `pageview-token-purge-runbook.md` §6; **not run** (owner runs, shares counts). No deletions/revocations without separate authorization.
- Owner decisions recorded 2026-10-13: Help URLs `/help/<category>/<slug>` and `/fr/aide/<categorie>/<slug>` with typed TS content and 301 from `/guides/*`; changelog starts at the first verifiable Git release; comparisons start with spreadsheets/paper/manual (named vendors need current official sources + review); `/watch/*` stays out of the sitemap; reuse the existing R2 videos/thumbnails (no new infrastructure/DNS); Preview host: investigate a code fix but never `VERCEL_URL` as production canonical, Preview stays noindex; blog priorities: online booking, digital inspections, quotes/estimates/approvals, maintenance reminders, customers & work orders, Excel vs shop software, SMS & email communication, shop productivity (EN/FR national, no invented volumes or capabilities). FR review is preliminary only: no claim of native or legal review.

**Not started:** PR #4 (French commercial pages), PR #5 (four Features pages). No branches for them exist.

Production (verified via Vercel tooling): deployment `dpl_5B1JEHs3jFffwdgCaJyqN68dFczM` (commit `843e304`) was **READY** and aliased to `www.garage-os.ca`. Verified on the public domain through the Vercel fetch tool: `/`, `/pricing`, `/admin/login` serve `lang="en-CA"`; `/fr` serves `lang="fr-CA"`, `noindex, follow`, canonical `https://www.garage-os.ca/fr`; canonicals of `/` and `/pricing` correct; `robots.txt` has all Disallow rules and **no `Sitemap:` line yet**; `/quote/<invalid>` and `/portal/<invalid>` return 404 with `X-Robots-Tag: noindex, nofollow, noarchive` and `Referrer-Policy: same-origin`; login page renders. **Not verified on production:** responsive layout (390/820/1440 was verified only on a local production build of the same code: 47/47 checks), real quote/manage/portal flows with real tokens (verified locally: 32/32 regression checks), `curl` from the sandbox to the public domain (blocked by the sandbox proxy — use the Vercel `web_fetch_vercel_url` tool). The docs-only deploy that follows this handoff was not re-verified beyond "docs only".

## 5. Code map (what exists)

- `src/lib/seo/routes.ts` — **single route table** (`PUBLIC_ROUTES`, `ROUTE_FAMILIES`; `frStatus` live|planned|none, `frIndexable`, `parent` fallbacks) and `matchRoute / switchTarget / localizeHref / isIndexablePath / getRoute`.
- `src/lib/seo/metadata.ts` — `pageMetadata({path,title,description})`: own canonical, og, noindex for non-indexable FR. `src/lib/seo/site.ts` — `getSiteUrl()`, `canonicalUrl()`. `src/lib/seo/root-metadata.ts`, `html-lang.ts` (`HTML_LANG = {en:"en-CA", fr:"fr-CA"}`), `switch-params.ts` (carries only sanitized `utm_*` on language switch).
- `src/components/root/{RootShell,fonts}.tsx`; `src/app/(site)/layout.tsx` (EN root, imports globals.css), `src/app/(fr)/layout.tsx` + `src/app/(fr)/fr/page.tsx` (FR home); all previous routes live under `src/app/(site)/`. `robots.ts` stays at `src/app/robots.ts`.
- `src/components/marketing/{MarketingLocaleProvider,LocaleLink,LanguageToggle,HomeView}.tsx`.
- `src/lib/privacy/private-paths.ts` (private/token prefixes, normalisation, `isPrivatePath`), `next.config.ts` headers, `scripts/redact-pageview-private-paths.ts`.
- Tests: `tests/i18n-routing.test.ts`, `tests/seo-canonical.test.ts`, `tests/privacy-indexation.test.ts`, `tests/fr-terminology.test.ts`. Last full run on the PR #101 head: 836 tests, 829 pass, 0 fail (rest skipped), `tsc` clean, ESLint 0 errors.
- Commands: `npx tsc --noEmit`; `npx eslint src tests`; `npx tsx --test tests/*.test.ts`; `npx next build` (needs env such as `DATABASE_URL`, `NEXTAUTH_*`, `NEXT_PUBLIC_APP_URL`; DB tests need a PostgreSQL). Turbopack rejects `node_modules` symlinks outside the project root (use a hard-link copy or build in the main checkout).
- Hosting IDs: Vercel team `team_ZCF5BCM7w7eiMpAFtvIXKNf0`, project `prj_fliI0WW7l5wBmrAwfKyMNe3f24ZF` (`garage-os`). Production DB is Neon; Supabase is storage only.

## 6. Document map (where each document lives)

| Document | Purpose | Location |
|---|---|---|
| `docs/SEO_HANDOFF.md` | This entry point | main (via docs PR) |
| `docs/seo-master-plan.md` | Master plan: decisions D1–D15, motors, keyword/competitor analysis, PR matrix PR-00…PR-23+, status | main (via docs PR); previously only on branch `claude/resources-renovation` |
| `docs/resources-renovation-plan.md` | Resources/Help renovation plan, Annex A article inventory | main (via docs PR); previously branch only |
| `docs/resources-audit-2026-10.md` | Audit of outdated Resources vs product | main (via docs PR); previously branch only |
| `docs/seo-round-2-plan.md` | Tanda 2 technical plan (now executed in #101/#102) — historical | main (via docs PR); previously branch only |
| `docs/seo-pr3-proposal.md` | **Implementable spec for PR #3** | main (via docs PR) |
| `docs/seo-i18n-architecture-decision.md` | Separate root layouts decision, en-CA note | already on main (PR #101) |
| `docs/fr-terminology-review.md` | FR terminology rationale, legal flags, follow-ups | already on main (PR #102) |
| `docs/seo-manual-checklist.md` | Manual/external items (Search Console, Bing, Resend, data cleanup, Québec review) | main (via docs PR); previously branch only |
| `docs/seo-indexation-policy.md` | Indexation/privacy policy | already on main (PR #100) |
| `docs/pageview-token-purge-runbook.md` | PageView token purge runbook | main (via docs PR); previously branch only |

Branch `claude/resources-renovation` (remote) still holds the original copies and is based on an older `main`; **do not merge that branch** (it would revert code). Its docs are now on `main`; treat `main` as source of truth. Numbering note: the master plan uses PR-xx; the owner's working names are "PR #3/#4/#5" (see §8); GitHub numbers are #99–#103 so far.

## 7. Dependencies between PRs

PR #3 (sitemap/hreflang) depends on #101 (done). PR #4 (FR commercial pages) depends on #101 + #102 (done) and on the **Québec contextual terminology review** (checklist F) before publishing; PR #4 must flip `frStatus`→`live` per page and use `LocaleLink`; it feeds the sitemap/hreflang from PR #3 automatically, so merge #3 before or together with the first indexable FR page. PR #5 (Features) depends on #4's FR route/pages pattern and #102 terminology. Help platform (PR-12/13) depends on routes/i18n. Content PRs depend on keyword data and native FR review.

## 8. Backlog (do not lose the national bilingual objective)

1. **PR #3 (merged `f10a221`, production verified)** — sitemap, hreflang, multilingual SEO. Spec: [`seo-pr3-proposal.md`](./seo-pr3-proposal.md). Decisions fixed: no `/book/[slug]` in sitemap; `/fr` stays noindex; hreflang only real, indexable, self-canonical equivalents; en-CA/fr-CA/x-default→EN.
2. **PR #4** — French commercial pages for the 12 existing pages (master plan PR-05b/07/09 parts): `/fr/produit`, `fonctionnalites`, `tarifs`, `integrations`, `demo`, `commencer`, `demarrage-rapide`, `a-propos`, `contact`, `confidentialite`, `conditions`, `nouveautes` (+ `aide` later). Original French copy, Québec review first, flip route table flags, page-level links via `LocaleLink`.
3. **PR #5** — first four Features pages EN/FR: Online Booking / Réservation en ligne; Digital Vehicle Inspections / Inspections numériques de véhicules; Quotes & Approvals / Devis et approbations; SMS & Email Communications / Communications SMS et courriel. Original content, verifiable claims only, metadata, internal links, CTA to Demo/Signup, plan gates derived from entitlements.
4. Full Resources renovation + bilingual Help Center (PR-12…PR-20: content platform, search, ≈63 articles, redirects from `/guides`, contextual `HelpLink`, real dated changelog).
5. Educational content + commercial SEO (PR-16/17, Solutions pages PR-10).
6. Analytics and conversions (PR-06: real `locale` already fixed in the beacon; channel/CTA events; first-party, privacy first; update privacy policy text).
7. Verified comparisons (PR-18): competitor claims only from official sources on the publication date; not verifiable from the sandbox.
8. SEO CI + later optimisation with ≥4 weeks of real data (PR-22/23).

## 9. Pending items — kept separate

**Security (priority; not SEO)**
- PageView dry-run on Neon: `npx tsx scripts/redact-pageview-private-paths.ts --allow-remote` (counts only) — **not run**. Real cleanup (`--apply`) only with backup (Neon PITR 6 h; daily R2 dump 30 days; `backup_ro` role) and explicit owner authorization. Runbook: `pageview-token-purge-runbook.md`.
- Evaluate historical tokens that may have appeared in `PageView.path` (portal/quote links last 30 days); do not revoke indiscriminately; revoke-all exists per customer in the portal card.

**SEO / product**
- PR #3 sitemap + hreflang; French indexation (after approval); Québec contextual terminology review before FR commercial content; legal review of FR privacy/terms terminology and Québec consumer-protection wording for the repair estimate.
- **Technical pending — Preview `NEXT_PUBLIC_APP_URL`:** the Vercel Preview environment has a stale fixed `NEXT_PUBLIC_APP_URL` (points to an old branch Preview host). Because canonicals, `og:url`, sitemap and `robots.txt` Sitemap line all derive from `getSiteUrl()`, every Preview emits that wrong host (confirmed on the PR #105 Preview). Production is correct. Fix is an owner env-var change in Vercel (not done here; env vars out of scope); until then do not judge hosts from Previews. Optional code-side alternative: derive the host from `VERCEL_URL` only when `VERCEL_ENV=preview`.
- Issue #103 performance (`/?_rsc` revisits) — keep separate.
- Follow-ups from the terminology PR: FR videos (`video/src/locales/fr.ts`, narration alignment) still use old terms — **do not regenerate automatically**; seed row 'Soumissions et factures' in applied migration `20261009100000_sales_crm_foundation` — fix only with a new safe procedure; SMS "ordre N" could read "ordre de travail N".
- Other findings: `/pricing` SSR has no `<h1>`; sales-video CDN/deployment status unverified; comment in `entitlements.ts` says SMS values are provisional (stale).

**Final manual/external configuration (owner, at the end)**
- Google Search Console; Bing Webmaster Tools; Resend click-tracking OFF for transactional domains (links carry bearer tokens); Preview `NEXT_PUBLIC_APP_URL` env var (stale fixed URL, makes Preview canonicals wrong; production is correct); confirm `X-Robots-Tag` headers on the public domain from a real client. Details in `seo-manual-checklist.md`.

## 10. Risks

- Switching language is a full page load (separate root layouts) — expected.
- Turning a FR page indexable without sitemap/hreflang consistency; mixing fallback links into hreflang (forbidden).
- Terminology: Québec garages often say "soumission"/"bon de travail"; owner chose "Devis"/"Ordre de travail" with synonyms — validate with Québec speakers.
- `noindex` is not a security control; token URLs are protected by their tokens, `Referrer-Policy: same-origin`, and `X-Robots-Tag`.
- Vercel Preview Oswald font flake; local Turbopack symlink panic.
- Do not trust earlier "verified" claims beyond §4.

## 11. Instructions for the next agent

1. Read this file, then `seo-pr3-proposal.md`, `seo-master-plan.md` (sections 5, 6, 12, 13), `seo-manual-checklist.md`, `seo-i18n-architecture-decision.md`.
2. PR #3 is done. Next step is PR #4 (only when the owner asks): `git fetch origin && git checkout -b <new-branch> origin/main` (never from `claude/resources-renovation`).
3. When PR #4 flips a FR page to `frStatus: "live"` + indexable, the sitemap and hreflang (en-CA/fr-CA/x-default→EN) pick it up automatically; add the FR page and flip the flags together, and check reciprocity (`tests/seo-sitemap.test.ts`).
   Keep the standing constraints: no DNS/Search Console/Bing/Resend/PageView actions in code sessions.
4. Run `tsc`, ESLint, full tests, build; open the PR (follow `.github` PR template if present); verify the Preview (`/sitemap.xml`, `/robots.txt`, hreflang on pages); report; **wait for owner authorization before merging** unless the owner has said otherwise.
5. After merge, verify production using the Vercel fetch tool, then update `seo-master-plan.md` status and this file's §4 table.
6. Keep this handoff current at the end of every session.
