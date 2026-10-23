# SEO + Resources — future backlog

**Purpose.** Everything that is *not* done after SEO + Resources V1 (2026-10-13), written so any agent can resume months later without the original conversation. Start with [`SEO_HANDOFF.md`](./SEO_HANDOFF.md) and [`SEO_V1_FINAL_REPORT.md`](./SEO_V1_FINAL_REPORT.md). **No task is done merely because it is documented.** Status words: *NOT STARTED / DESIGNED / PARTIAL / OPEN / UNVERIFIED / NOT RUN*.

## Reconciliation 2026-10-22 (supersedes the per-task "Verified current state" lines below where they differ)
Audit against `main` (`a7ded96`, then PRs #179–#188). Evidence level: code and CI; production only where stated. Anything not listed keeps the status written below.

| ID | Status now | Evidence |
|---|---|---|
| INF-02 | **DONE (account connected to the tooling)** — owner still confirms it is the production account and which domain each `EMAIL_FROM_*` uses | Resend read-only check 2026-10-22: `garage-os.ca` and `mail.garage-os.ca`, both verified, click and open tracking `false`; `docs/sales-email-launch-readiness.md:20` |
| INF-05 | **REPLACED** — billing exists; the premise "#47 unmerged" was wrong | #63 merged 2026-09-29 (`ensureSmsOverageItem`, `reportSmsOverageUsage`, `retryPendingSmsOverage`); LIVE meter recorded in `docs/stripe-live-cutover.md`. **Owner decision 2026-10-22: the overage price stays inside the product, not public marketing.** #47 is obsolete and should be closed |
| QA-01 | **DONE** | #180 merged; rendered `/admin/login`, `/admin/signup`, `/admin/verify-email-sent`: one `<h1>`, one `<main>` |
| QA-02 / QA-05 | **PARTIAL** — 3 articles corrected; the rest verified against code only | #181: `approval-history` (now "Understand estimate approvals"), `estimate-to-invoice`, `maintenance-reminders`. **Owner decision: do not build an approval-history screen**; `QuoteApproval.channel` is hard-coded `SMS_LINK` (product finding, unchanged). UI click-through still pending |
| LANG-03 (new) | **DONE** | #179: `sales-calling.ts` "Bons de travail" → "Ordres de travail"; `tests/fr-terminology.test.ts` green |
| SEO-07 (new) | **DONE** | #182: `/watch/*` noindex, canonical on the site host without the token, no hreflang, no `VideoObject` (no verified upload date) |
| OPS-01 / DOC-01 | **DONE** | #184: untracked the self-referencing `node_modules` symlink (from #178) and `.pyc`; `.github/workflows/ci.yml` job `verify`; baseline in `docs/testing.md` (1,216 tests, 0 fail, 32 DB skips). **Owner action: require `verify` in branch protection** |
| SEC-04 | **IMPLEMENTED, DELETION OFF** (#185) | `src/lib/privacy/retention.ts`, daily dry-run cron, `docs/analytics-retention-runbook.md`; deletes only with `ANALYTICS_RETENTION_APPLY=true`; 13 months subject to legal review |
| PRD-01 | **IN PROGRESS** — step 1 merged (#188 pure vocabulary); step 2 migration (#190, draft) and step 3 server tracking (#192, draft) wait for owner approval because the Vercel production build applies migrations on merge | `src/lib/analytics/contract.ts`. DNT/GPC and the UTM sanitiser were already live (#116) |
| SEC-05 | **DONE in code; owner action pending** — set `ANALYTICS_HASH_SECRET` (Production + Preview) | #186: `src/lib/privacy/visitor-hash.ts` (HMAC-SHA256, ephemeral random key + one warning when the variable is missing; never the public date). `docs/operations-runbook.md` § ANALYTICS_HASH_SECRET. Distinct-visitor counts reset once when the secret goes live |
| SEC-06 | **DONE** | #187: `/api/track` — DNT/GPC, same-site Origin/Sec-Fetch-Site, 2 KB bounded read, 120/min per IP via the shared limiter, strict payload validation, always 204, payload-free logs. Follow-up: `RateLimitBucket.id` still embeds the raw IP for every limiter |
| SEC-07 | **DONE (no active leak found; protection pinned)** | #189: `/watch/*` `Referrer-Policy: same-origin` (not `no-referrer`: that would make same-origin POSTs send `Origin: null` and `/api/track` would drop them), `X-Robots-Tag`, `no-store` when `?t=` is present, `referrerPolicy="no-referrer"` on the poster image |
| QA-04 | **DONE (non-required check)** | #191: `.github/workflows/db-tests.yml` — `postgres:16` service, one fresh database per suite, all 31 DB suites (408 tests) pass with 0 skips. Suites leak shared state when run together in one database (issue-ready note in `docs/testing.md`); nine suites share a flaky `Date.now()` phone-fixture pattern. Owner decides whether `db-tests` becomes required |
| New, still open | SEC-08 (PIA/retention register entry for analytics), FR-02 (missing FR routes, `/fr/aide`), QA-06 (link checker over built HTML), DOC-02 (remaining stale docs), PRD-09 (approval history UI — **not pursued, owner decision**) | audit report 2026-10-22 |

Corrections to statements further down: the proxy was at the repository root, where Next.js 16 never loads it when `app` lives under `src/` (see PERF-01 / `docs/perf-01-investigation.md`); it now lives in `src/proxy.ts`; DNT/GPC is honoured by `/api/track` since #116; the "analytics-v2-contract.md §1: gaps" list is outdated for DNT/GPC only; the visitor-hash salt is currently the public date (SEC-05).

## Reconciliation 2026-10-23 (end of the autonomous sprint; supersedes 2026-10-22 where different)
Full detail, merge SHAs and next steps: [`handoffs/2026-10-23-analytics-seo-handoff.md`](./handoffs/2026-10-23-analytics-seo-handoff.md).

| ID | Status now | Evidence |
|---|---|---|
| PRD-01 | **Server side DONE and in production; CTA collection OFF; signup attribution (#203) awaits owner approval** | #190 migration applied; #192 tracking; #200 dormant CTA instrumentation (`ANALYTICS_CTA_ENABLED` unset); #201 panels in `/platform/analytics` |
| SEC-04 | **DONE, deletion still OFF** | #197 extends retention to `AnalyticsEvent`; `ANALYTICS_RETENTION_APPLY` unset; daily dry-run cron |
| PERF-01 | **Root cause fixed** | #198: proxy moved to `src/proxy.ts`, host lookup fails open (1.5 s); #103 not reproduced with production data |
| QA-02 | **DONE for code verification** (#199, #204 "Quotes" menu name); a 5-item live-UI walk remains | `docs/help-article-verification-2026-10.md` |
| QA-06 / CNT-09 | **DONE** | #195 link audit, #202 contextual links |
| Page-view gap | **Pipeline proven working**; normal-profile miss unexplained | `docs/analytics-production-verification.md` |
| SEC-01/02/03 | **Still not executed** (needs owner approval + backup) | `docs/pageview-token-purge-runbook.md` |
| Owner-gated | #203 merge, CTA flag, retention apply, privacy notice wording, French indexing, Quote vs Estimate naming | handoff §11 |

## Priorities
- **P0** — security or legal/external prerequisites that gate indexing or expose users. Do first.
- **P1** — needed for a complete, bilingual, measurable product.
- **P2** — content and conversion growth.
- **P3** — optimisation and nice-to-have.

## Standing rules (apply to every task)
Max two agents in parallel · small PRs · `tsc`, ESLint, full tests, `next build` and Preview READY before proposing a merge · functional merges need owner authorisation (docs-only PRs may be merged when clean and green) · never edit applied migrations · no DNS, Search Console, Bing, Resend, Neon or environment-variable changes without explicit authorisation · do not alter billing, subscriptions, CRM, authentication or booking logic · French pages stay `noindex` until natively (and, where needed, legally) reviewed and published as reciprocal pairs · no invented numbers, testimonials, competitor claims or product capabilities.
Practical gotchas: `next build` needs placeholder env (`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`); run `npx prisma generate` after pulling schema changes; the rendered SEO tests (`tests/seo-rendered.test.ts`, `seo-fr-wave1`, `features-pages`) are skipped unless a build exists (`.next/server/app`); delete `.next/types` after switching branches before `tsc`; the Vercel Preview build can flake on the Oswald font fetch (redeploy the same commit once, never push an empty commit); do not use `pkill -f` with a command string in the agent shell (it kills the shell) — use `fuser -k <port>/tcp`.

## Recommended execution order
1. **SEC-01 → SEC-03 → SEC-02** (PageView/Neon) and **INF-02** (Resend) — owner-driven, independent of SEO.
2. (V1 PRs #113 → #116 merged and production-verified on 2026-10-14.) Next: **SEO-01** (Search Console) and **SEO-02**.
3. **LANG-01** and **LANG-02** in parallel; **DOC-01** (CI); **QA-04**; **QA-02**.
4. **FR-01** (pair publication), **PERF-01/02**, **CNT-01/02**, **PRD-01** (+PRD-02/03/04/08, SEC-04), **INF-05**.
5. P2/P3 content and optimisation as data arrives.

## Index
| ID | Title | Prio | Needs human | Needs legal | External services |
|---|---|---|---|---|---|
| [INF-02](#inf-02) | Resend click-tracking OFF for transactional domains | P0 | YES | No | Resend. |
| [LANG-01](#lang-01) | Native Québec French review of all French pages | P0 | YES | No | — |
| [LANG-02](#lang-02) | Legal review: privacy, terms, pricing/renewal wording, STOP/CASL statements, Québec consumer-protection references | P0 | YES | YES | External counsel. |
| [SEC-01](#sec-01) | PageView dry-run in Neon (read-only, counts only) | P0 | YES | No | Neon (production database). |
| [SEC-02](#sec-02) | Historical PageView cleanup with backup | P0 | YES | No | Neon. |
| [SEC-03](#sec-03) | Token-exposure assessment and revocation decision | P0 | YES | Maybe | Neon, Search Console. |
| [SEO-01](#seo-01) | Google Search Console: verify domain, submit sitemap, monitor | P0 | YES | No | Google Search Console, DNS. |
| [CNT-01](#cnt-01) | Expand the Help Center toward the planned coverage (≈63 articles, 16 categories) | P1 | YES | Maybe | — |
| [CNT-02](#cnt-02) | French Help articles (real translations only) | P1 | YES | No | — |
| [DOC-01](#doc-01) | Wire tests, ESLint and the SEO guard into CI | P1 | YES | No | GitHub. |
| [FR-01](#fr-01) | Publish French pages pair by pair (live + indexable + reciprocal hreflang) | P1 | YES | YES | Search Console. |
| [INF-05](#inf-05) | SMS overage billing vs public copy | P1 | YES | Maybe | Stripe. |
| [PERF-01](#perf-01) | Issue #103: `GET /?_rsc=…` prefetch hangs 7–30 s on revisits of `/` | P1 | Maybe | No | Vercel logs. |
| [PERF-02](#perf-02) | Lighthouse and Core Web Vitals baseline and fixes | P1 | Maybe | No | PageSpeed/Lighthouse. |
| [PRD-01](#prd-01) | Analytics v2 implementation (storage, events, panels) | P1 | YES | YES | — |
| [PRD-02](#prd-02) | Signup attribution record (first touch, per Shop, idempotent) | P1 | YES | YES | — |
| [PRD-03](#prd-03) | CTA click events (`demo_book`, `demo_interactive`, `signup_start`, `plan_select_*`, `pricing_view`, `watch_play`) | P1 | YES | YES | — |
| [PRD-04](#prd-04) | Conversion panels in `/platform/analytics` | P1 | YES | No | — |
| [PRD-08](#prd-08) | Privacy-policy text for analytics (EN/FR) after legal review | P1 | YES | YES | Counsel. |
| [QA-02](#qa-02) | Verify Help article claims against the real product (start with approval history) | P1 | YES | No | — |
| [QA-04](#qa-04) | Run DB-backed regression suites and a smoke test (login, signup, dashboard, booking, portal) | P1 | Maybe | No | PostgreSQL / Preview DB. |
| [SEC-04](#sec-04) | Retention policy for first-party analytics (13 months) with verifiable purge | P1 | YES | No | GitHub Actions secrets. |
| [CNT-03](#cnt-03) | Blog: bilingual structure and priority topics | P2 | YES | No | — |
| [CNT-05](#cnt-05) | Solutions pages (problem-based) | P2 | YES | No | — |
| [CNT-06](#cnt-06) | Compare: GarageOS vs spreadsheets/paper/manual first; vendor comparisons only with current official sources | P2 | YES | YES | Competitor sites. |
| [CNT-07](#cnt-07) | Changelog: first verifiable Git release and dated entries | P2 | YES | No | — |
| [CNT-08](#cnt-08) | Keyword and search-intent strategy | P2 | YES | No | Search Console / optional keyword tool. |
| [CNT-09](#cnt-09) | Internal-linking pass | P2 | No | No | — |
| [CNT-11](#cnt-11) | `/resources` French equivalent | P2 | YES | No | — |
| [INF-01](#inf-01) | Preview host: canonical/sitemap show a stale host on Vercel Previews | P2 | YES | No | Vercel env. |
| [INF-03](#inf-03) | Review the French videos and voice-over | P2 | YES | No | Cloudflare R2. |
| [INF-06](#inf-06) | Video CDN: verify R2 publication and the website video block | P2 | YES | No | Cloudflare R2/DNS. |
| [PRD-05](#prd-05) | Demo-request form connected to the CRM (D14) | P2 | YES | YES | — |
| [PRD-07](#prd-07) | Contextual help links inside the dashboard (`HelpLink`) | P2 | YES | No | — |
| [SEO-02](#seo-02) | Bing Webmaster Tools | P2 | YES | No | Bing Webmaster, DNS. |
| [SEO-06](#seo-06) | Monitor the 301 consolidation of `/guides/*` | P2 | YES | No | Search Console. |
| [CNT-04](#cnt-04) | Glossary | P3 | YES | No | — |
| [CNT-10](#cnt-10) | Regional content (province/city) only if justified by data | P3 | YES | No | — |
| [INF-04](#inf-04) | Fix legacy seed data of an applied migration without editing it | P3 | YES | No | Neon. |
| [PERF-03](#perf-03) | Help search index size at scale | P3 | No | No | — |
| [QA-01](#qa-01) | Admin login/signup: two `<h1>` and no `<main>` (issue #117) | P3 | No | No | — |
| [SEO-03](#seo-03) | Video SEO: video sitemap and `VideoObject` | P3 | YES | No | Search Console. |
| [SEO-04](#seo-04) | Post-launch optimisation (titles, CTR, internal links, refreshes) | P3 | YES | No | — |
| [SEO-05](#seo-05) | Structured-data expansion (SoftwareApplication, Offer, FAQ) only when verifiable | P3 | No | Maybe | — |

---

# P0 tasks

## INF-02
**Resend click-tracking OFF for transactional domains** — priority **P0**

- **Problem:** Transactional emails carry bearer-token links (quote approval, portal, appointment management). Click-tracking rewrites links through a third-party redirect that can expose tokens in provider logs.
- **Objective:** Click-tracking disabled on every domain that sends token links.
- **Verified current state:** NOT DONE (manual external setting; in `docs/seo-manual-checklist.md`). No agent touched Resend.
- **Files / modules:** `docs/seo-manual-checklist.md`, `src/lib/email.ts`, `src/lib/email-config.ts`.
- **Dependencies:** Access to the Resend dashboard.
- **Technical scope:** In Resend, disable click tracking for each sending domain used for transactional mail; send a test quote email and confirm the link is the direct `garage-os.ca` URL.
- **Acceptance criteria:** Test email shows direct links (no tracking redirect).
- **Tests needed:** —
- **Risks:** Marketing/sales domains may legitimately use tracking; keep it off only for transactional domains.
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** Resend.
- **Related PRs / issues:** —
- **Recommended order:** Early (10 minutes).

## LANG-01
**Native Québec French review of all French pages** — priority **P0**

- **Problem:** All French commercial pages are assistant-written/edited and not natively reviewed; Québec garage vocabulary ('soumission', 'bon de travail', 'texto', 'courriel') needs a native decision.
- **Objective:** A named native reviewer approves or edits every FR page that will be indexed.
- **Verified current state:** NOT DONE. A preliminary review with flags exists.
- **Files / modules:** `docs/fr-wave1-review.md`, `docs/fr-terminology-review.md`, `src/lib/marketing-locale.ts`, `marketing-pages.ts`, `marketing-plans.ts`, `feature-pages.ts`, `marketing-flow.ts`.
- **Dependencies:** Reviewer identified by the owner.
- **Technical scope:** Reviewer reads each FR page and records approved/changed text and the approved-route list; changes applied as copy-only PRs.
- **Acceptance criteria:** A signed-off list of approved FR routes in the repo (appended to `fr-wave1-review.md`), the input for FR-01.
- **Tests needed:** `tests/fr-terminology.test.ts` extended if terms change.
- **Risks:** Terminology drift between UI, emails and site.
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** —
- **Related PRs / issues:** —
- **Recommended order:** Parallel with SEC tasks; blocks FR-01.

## LANG-02
**Legal review: privacy, terms, pricing/renewal wording, STOP/CASL statements, Québec consumer-protection references** — priority **P0**

- **Problem:** French privacy/terms, trial/auto-renewal/annual-billing wording, 'taxes en sus' and statements about STOP handling carry legal weight; applicability of the Québec Consumer Protection Act to B2B shops must be checked; analytics text (PRD-08) needs Law 25 wording.
- **Objective:** Counsel-approved EN/FR texts applied verbatim.
- **Verified current state:** NOT DONE. Items flagged in `fr-wave1-review.md`; no legal claim is made anywhere.
- **Files / modules:** `src/app/(site)/privacy/page.tsx`, `terms/page.tsx`, `src/lib/marketing-plans.ts` (TRIAL_COPY), `docs/analytics-v2-contract.md` §8 and §10.2.
- **Dependencies:** Counsel.
- **Technical scope:** Counsel reviews; engineering applies approved text; no agent changes wording without that approval.
- **Acceptance criteria:** Approved text merged; `fr-wave1-review.md` records the approval date.
- **Tests needed:** Copy-only tests.
- **Risks:** Publishing unreviewed legal text.
- **Human intervention:** YES.
- **Legal approval:** YES.
- **External services:** External counsel.
- **Related PRs / issues:** —
- **Recommended order:** Parallel with LANG-01; blocks FR-01 for those pages and PRD-08.

## SEC-01
**PageView dry-run in Neon (read-only, counts only)** — priority **P0**

- **Problem:** Before PR #100 (2026-10-10) the first-party beacon stored full pathnames, including bearer-token URLs (`/portal/<token>`, `/quote/<token>`, `/inspection/<token>`, `/book/<slug>/manage/<token>`, `/sales/*`). New rows are clean; historical rows are unknown.
- **Objective:** Know how many private-path rows exist, over which dates and whether any token is still usable, without reading or printing tokens.
- **Verified current state:** NOT RUN. No agent ever had authorised database access. Script and runbook exist; validated only on a local PostgreSQL.
- **Files / modules:** `scripts/redact-pageview-private-paths.ts` (`--report`, `--allow-remote`), `docs/pageview-token-purge-runbook.md` §2 and §6, `src/lib/privacy/private-paths.ts`.
- **Dependencies:** Owner provides/uses a read-only Neon role (`backup_ro`) themselves; no agent handles credentials.
- **Technical scope:** Run `npx tsx scripts/redact-pageview-private-paths.ts --report --allow-remote` with a read-only `DATABASE_URL` (or the aggregate SQL in runbook §6 Option B). Record counts only.
- **Acceptance criteria:** A counts-only report exists (rows per private family, odd forms, date range, distinct paths/visitors, search-engine referrers on private rows, token-shaped values in other columns, tokens still usable). No path/token/PII appears in any chat, log or doc.
- **Tests needed:** `tests/privacy-indexation.test.ts` stays green; new tests only if the script changes.
- **Risks:** Printing paths would leak tokens; a write role plus a mistyped `--apply` would delete rows.
- **Human intervention:** YES (credentials/access).
- **Legal approval:** No.
- **External services:** Neon (production database).
- **Related PRs / issues:** #100, #110
- **Recommended order:** 1 — first; blocks SEC-02/SEC-03.

## SEC-02
**Historical PageView cleanup with backup** — priority **P0**

- **Problem:** Rows with private paths should be removed once the report is reviewed; they also show in the Super Admin traffic panel and in any backup taken before the purge.
- **Objective:** Delete only private-path rows, idempotently, with a restore point.
- **Verified current state:** NOT DONE. `--apply` validated locally only (9 private rows deleted, 3 public kept, idempotent re-run).
- **Files / modules:** `scripts/redact-pageview-private-paths.ts --apply`, runbook §1/§4/§5, `docs/operations-runbook.md` (Neon PITR 6 h on Free; daily R2 dump, 30-day retention).
- **Dependencies:** SEC-01 reviewed; explicit owner authorisation for `--apply`.
- **Technical scope:** Create a Neon branch (or confirm a fresh PITR point) → re-run report, save counts → `--apply --allow-remote` → re-run: 0 rows → spot-check `/platform/analytics` → delete the temporary branch. Targeted `UPDATE` for token-shaped values in other columns if the report shows any (not covered by `--apply`).
- **Acceptance criteria:** Report shows 0 private rows afterwards; panel renders; note that older dumps keep the rows until they expire.
- **Tests needed:** Script is idempotent; add tests only if modified.
- **Risks:** Backups taken before the purge still hold tokens (expire with the 30-day dump retention and 30-day token lifetime).
- **Human intervention:** YES (authorisation + write access).
- **Legal approval:** No.
- **External services:** Neon.
- **Related PRs / issues:** #100
- **Recommended order:** 2 — after SEC-01.

## SEC-03
**Token-exposure assessment and revocation decision** — priority **P0**

- **Problem:** Tokens that appeared in `PageView.path` and are still valid (portal/quote links, last 30 days) may be exposed to anyone with panel, DB, backup or Vercel-log access; request logs record URL paths inherently.
- **Objective:** Decide per evidence whether to revoke specific tokens, never indiscriminately.
- **Verified current state:** NOT DONE. Decision table written in runbook §3.
- **Files / modules:** Runbook §3; portal card 'revoke all' per customer; quote links are re-issued by re-sending the quote.
- **Dependencies:** SEC-01 report.
- **Technical scope:** No search-engine referrers and nothing in Search Console: purge and let tokens expire (30 days). Referrers or Search Console hits: revoke only affected valid tokens and temporarily remove the matching `Disallow` so the crawler can read `noindex`. Internal exposure only: purge, optionally re-issue sensitive portal links.
- **Acceptance criteria:** A written decision (counts and chosen action) added to the handoff; revoked tokens listed by count only.
- **Tests needed:** —
- **Risks:** Over-revoking breaks customers' links; under-revoking leaves exposure.
- **Human intervention:** YES (decision + execution).
- **Legal approval:** Possibly: privacy-incident assessment under Law 25 if exposure is confirmed.
- **External services:** Neon, Search Console.
- **Related PRs / issues:** #100
- **Recommended order:** 3 — after SEC-01 (may run before SEC-02).

## SEO-01
**Google Search Console: verify domain, submit sitemap, monitor** — priority **P0**

- **Problem:** Without Search Console there is no indexation or query data; V1 cannot be measured and the `/guides/*` 301 consolidation cannot be monitored.
- **Objective:** Domain property verified by DNS, sitemap submitted, coverage reviewed weekly for 4 weeks.
- **Verified current state:** NOT DONE (owner; no agent has DNS or Search Console access).
- **Files / modules:** `https://www.garage-os.ca/sitemap.xml`, `docs/seo-manual-checklist.md`.
- **Dependencies:** DNS access.
- **Technical scope:** Add the domain property (DNS TXT), submit the sitemap, URL-inspect `/`, `/help`, a Help article, `/features/online-booking` and a `/guides/*` URL (should show the 301). If a private URL is ever listed, temporarily remove its `Disallow` so `noindex` can be read.
- **Acceptance criteria:** Sitemap status Success (43+ URLs); no 'indexed, though blocked' for private routes; redirects recognised.
- **Tests needed:** Manual.
- **Risks:** —
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** Google Search Console, DNS.
- **Related PRs / issues:** #105
- **Recommended order:** Right after the V1 PRs are merged.


---

# P1 tasks

## CNT-01
**Expand the Help Center toward the planned coverage (≈63 articles, 16 categories)** — priority **P1**

- **Problem:** V1 has 13 articles in 7 categories; Annex A of the Resources plan lists ≈63 articles including troubleshooting and privacy/CASL topics.
- **Objective:** Add articles in waves of about 8 per PR, each claim traceable to code or UI strings.
- **Verified current state:** 13/63 articles; model, routes, search and related-link machinery are ready.
- **Files / modules:** `docs/resources-renovation-plan.md` (Annex A), `src/lib/help/{types,categories,articles,legacy-map}.ts`, `src/lib/admin-locale/`.
- **Dependencies:** QA-02; for FR: LANG-01.
- **Technical scope:** Add `HelpArticle` entries (id, EN slug, category, related); no new route code; add a category only if justified.
- **Acceptance criteria:** Each article lists its sources in the PR; search finds it; sitemap lists it; `tests/help-center.test.ts` passes.
- **Tests needed:** Existing Help tests plus per-wave claim review.
- **Risks:** Inventing instructions; stale UI names.
- **Human intervention:** YES (review each wave).
- **Legal approval:** For privacy/CASL articles.
- **External services:** —
- **Related PRs / issues:** #111, #113
- **Recommended order:** After QA-02.

## CNT-02
**French Help articles (real translations only)** — priority **P1**

- **Problem:** French Help routes exist but return 404; no automatic translations should be published.
- **Objective:** Natively reviewed French articles, published one by one with their EN pair.
- **Verified current state:** NOT STARTED.
- **Files / modules:** `src/lib/help/*` (`slug.fr`, `content.fr`), `/fr/aide/**` routes, `buildSearchIndex('fr')`.
- **Dependencies:** LANG-01; CNT-01 for source text.
- **Technical scope:** Add `content.fr` + `slug.fr` to an article; category FR names/slugs already exist; add the `/fr/aide` hub when the first articles ship; register in the route table and follow FR-01.
- **Acceptance criteria:** FR article pages 200, `noindex` until approved, then in the sitemap with hreflang to the EN article.
- **Tests needed:** Fixture tests exist; add real-pair tests.
- **Risks:** Machine-translated text.
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** —
- **Related PRs / issues:** #111
- **Recommended order:** After CNT-01 wave 1 and LANG-01.

## DOC-01
**Wire tests, ESLint and the SEO guard into CI** — priority **P1**

- **Problem:** No GitHub Actions workflow runs `tsc`, ESLint or tests (`.github/workflows` only has backups, sales cron and video render). The SEO guard needs a build first, so it is run by hand.
- **Objective:** A required PR check running `npx tsc --noEmit`, `npx eslint`, `npx tsx --test tests/*.test.ts`, and after `next build` the rendered SEO tests.
- **Verified current state:** NOT DONE.
- **Files / modules:** `.github/workflows/`, `package.json`, `tests/seo-*.test.ts`.
- **Dependencies:** Owner approval to add a workflow and branch protection.
- **Technical scope:** Add `ci.yml` (Node 22, `npm ci`, `prisma generate`, dummy env for build, optional Postgres service for DB tests); mark as required.
- **Acceptance criteria:** A metadata/canonical/noindex regression blocks merge.
- **Tests needed:** The workflow itself.
- **Risks:** Build needs env placeholders; the Oswald font fetch can flake.
- **Human intervention:** YES (approve workflow/protection).
- **Legal approval:** No.
- **External services:** GitHub.
- **Related PRs / issues:** #108
- **Recommended order:** Early; improves every later PR.

## FR-01
**Publish French pages pair by pair (live + indexable + reciprocal hreflang)** — priority **P1**

- **Problem:** French drafts exist but are `noindex`; `/fr` itself is `noindex`. Bilingual SEO is incomplete until pairs are published safely.
- **Objective:** For each approved EN/FR pair: `frStatus: live`, indexable, in the sitemap with reciprocal hreflang (`en-CA`, `fr-CA`, `x-default`→EN), self-canonical, linked from the language switcher.
- **Verified current state:** NOT DONE by design. Machinery exists and is test-locked.
- **Files / modules:** `src/lib/seo/routes.ts` (`PUBLIC_ROUTES`, `hreflangPaths`), `src/lib/seo/site.ts` (`alternatesFor`), `sitemap-entries.ts`, `tests/seo-fr-wave1.test.ts` (`APPROVED` list), `tests/features-pages.test.ts`.
- **Dependencies:** LANG-01 (and LANG-02 for legal pages); SEO-01.
- **Technical scope:** Per pair: set `frStatus: "live"` (leave `frIndexable` unset), add the route to `APPROVED` in `tests/seo-fr-wave1.test.ts`, update tests that assert noindex for it, build, check sitemap/hreflang reciprocity on Preview then production. Never flip one side of a pair.
- **Acceptance criteria:** Sitemap lists both URLs; each page lists the other with hreflang; no hreflang to a noindex page; Search Console hreflang report clean.
- **Tests needed:** `tests/seo-sitemap.test.ts` reciprocity extended with real pairs.
- **Risks:** Publishing before review; hreflang to fallbacks.
- **Human intervention:** YES (approval per pair).
- **Legal approval:** YES for legal pages.
- **External services:** Search Console.
- **Related PRs / issues:** #101, #105, #109, #114
- **Recommended order:** After LANG-01/02 and SEO-01.

## INF-05
**SMS overage billing vs public copy** — priority **P1**

- **Problem:** PR #47 (SMS overage subscription item) is unmerged; public pages must not state overage prices until billing is verified. V1 feature pages mention only the monthly allowance (derived from `PLAN_LIMITS`).
- **Objective:** Pricing/feature copy and billing agree.
- **Verified current state:** OPEN (billing not touched by this front).
- **Files / modules:** PR #47, `src/domain/sms.ts` (`SMS_OVERAGE_PRICE_CAD_PER_SEGMENT`), `src/config/entitlements.ts`, `tests/public-surface.test.ts`.
- **Dependencies:** Billing owner decision.
- **Technical scope:** Verify the Stripe metered item is live; only then add overage wording derived from the constant.
- **Acceptance criteria:** A test ties copy to constants.
- **Tests needed:** Extend `public-surface` test.
- **Risks:** Advertising a charge that is not billed.
- **Human intervention:** YES.
- **Legal approval:** Maybe.
- **External services:** Stripe.
- **Related PRs / issues:** #47
- **Recommended order:** Before any overage wording.

## PERF-01
**Issue #103: `GET /?_rsc=…` prefetch hangs 7–30 s on revisits of `/`** — priority **P1**

- **Problem:** Reproduced on old `main` and current code (local `next start`): after visiting `/fr` or `/pricing`, going back to `/` makes the home page's own RSC prefetches hang and abort.
- **Objective:** Root cause identified; fix only if isolated and regression-free, otherwise a written plan.
- **Verified current state:** OPEN, uninvestigated on a Vercel deployment.
- **Files / modules:** Issue #103; `src/proxy.ts` (matcher `"/"`), `src/app/(site)/page.tsx` (`revalidate = 300`), `HomeView`, `MarketingHeader`.
- **Dependencies:** Preview/production profiling.
- **Technical scope:** Reproduce on a Preview; inspect `proxy.ts` behaviour for `?_rsc` requests; try `prefetch={false}` on home links; compare with/without ISR.
- **Acceptance criteria:** Revisits of `/` complete prefetches in under 1 s on Preview.
- **Tests needed:** Playwright timing script (manual or CI).
- **Risks:** Touching `proxy.ts` can break shop-domain resolution.
- **Human intervention:** Maybe (production logs).
- **Legal approval:** No.
- **External services:** Vercel logs.
- **Related PRs / issues:** #103
- **Recommended order:** Any time; independent.

## PERF-02
**Lighthouse and Core Web Vitals baseline and fixes** — priority **P1**

- **Problem:** No Lighthouse/CWV data exists; the V1 environment had no Lighthouse tooling.
- **Objective:** Baseline mobile/desktop scores for `/`, `/pricing`, `/help`, a Help article, a feature page and `/resources`; fix regressions found.
- **Verified current state:** NOT RUN.
- **Files / modules:** `src/components/root/RootShell.tsx`, `fonts.tsx`, `public/`.
- **Dependencies:** SEO-01 data helps (CrUX).
- **Technical scope:** Run Lighthouse CI or PageSpeed on production; record LCP/INP/CLS; fix top items (fonts, image sizes, JS) in small PRs.
- **Acceptance criteria:** Scores and CWV recorded in the handoff; targets agreed with the owner after at least 4 weeks of data.
- **Tests needed:** Optional Lighthouse CI budget.
- **Risks:** Premature optimisation without data.
- **Human intervention:** Maybe.
- **Legal approval:** No.
- **External services:** PageSpeed/Lighthouse.
- **Related PRs / issues:** —
- **Recommended order:** After SEO-01 has data.

## PRD-01
**Analytics v2 implementation (storage, events, panels)** — priority **P1**

- **Problem:** Current analytics lacks channel classification, CTA events, signup attribution and conversion panels; a funnel cannot be measured.
- **Objective:** Implement `docs/analytics-v2-contract.md` as approved: `channel`/`pageType` columns, `AnalyticsEvent`, `SignupAttribution`→`Shop`, 8 CTA ids, DNT/GPC everywhere, role-limited reads, UTM allowlist, idempotent attribution, 13-month purge.
- **Verified current state:** DESIGN APPROVED IN CONCEPT; NOTHING BUILT. PR #116 (merged 2026-10-14) already hardens UTM and DNT/GPC on the existing pipeline.
- **Files / modules:** `docs/analytics-v2-contract.md`, `src/components/AnalyticsBeacon.tsx`, `src/app/api/track/route.ts`, `src/lib/platform/analytics.ts`, `src/lib/privacy/{private-paths,opt-out}.ts`, `prisma/schema.prisma` (`PageView`), `/platform/analytics`.
- **Dependencies:** Owner approval of the migration PR; LANG-02/PRD-08 for policy text; SEC-04.
- **Technical scope:** Split into: (1) additive schema migration only (new timestamp; never edit applied migrations) → (2) server classification + event endpoint + rate limit → (3) CTA instrumentation → (4) signup attribution in the shop-creation transaction → (5) panels + purge job.
- **Acceptance criteria:** Contract §10 items 1–8 each have a test; no cookie/localStorage; failures never affect signup or navigation.
- **Tests needed:** Unit + DB tests per contract §10.
- **Risks:** Privacy; migration risk; counts drop for DNT/GPC visitors.
- **Human intervention:** YES (approve migration + policy).
- **Legal approval:** YES (policy wording).
- **External services:** —
- **Related PRs / issues:** #110, #116
- **Recommended order:** After SEC-01…03 and LANG-02.

## PRD-02
**Signup attribution record (first touch, per Shop, idempotent)** — priority **P1**

- **Problem:** Needed to know which pages lead to signups.
- **Objective:** A `SignupAttribution` row created with the shop and never updated.
- **Verified current state:** NOT BUILT (PRD-01 step 4).
- **Files / modules:** `src/app/(site)/admin/signup`, shop-creation service, contract §4, §10.3, §10.5.
- **Dependencies:** PRD-01 steps 1–2.
- **Technical scope:** Read validated `from`/`lang` hand-off params; insert with `ON CONFLICT (shopId) DO NOTHING`; failure never fails signup; Super-Admin-only aggregate reads.
- **Acceptance criteria:** Create twice → one row; attribution failure → shop still created; shop users cannot read it.
- **Tests needed:** DB tests per contract §10.5/§10.3.
- **Risks:** Personal-data creep.
- **Human intervention:** YES (migration approval).
- **Legal approval:** YES (policy).
- **External services:** —
- **Related PRs / issues:** #110
- **Recommended order:** Inside PRD-01.

## PRD-03
**CTA click events (`demo_book`, `demo_interactive`, `signup_start`, `plan_select_*`, `pricing_view`, `watch_play`)** — priority **P1**

- **Problem:** No measurement of which CTAs convert.
- **Objective:** Fire-and-forget events that never delay navigation.
- **Verified current state:** NOT BUILT.
- **Files / modules:** Contract §2, §10.6; CTA components (`CTASection`, `FeaturePageView`, `PricingSection`, `Hero`, watch client).
- **Dependencies:** PRD-01 steps 1–2.
- **Technical scope:** Mark links with `data-cta`; one delegated listener sends `sendBeacon`; allowlisted ids; server dedupe + rate limit.
- **Acceptance criteria:** Endpoint down/500 does not change hrefs or signup; DNT/GPC drops events.
- **Tests needed:** Unit tests + a Playwright 'no navigation delay' check.
- **Risks:** Over-instrumentation.
- **Human intervention:** YES.
- **Legal approval:** YES (policy).
- **External services:** —
- **Related PRs / issues:** #110
- **Recommended order:** Inside PRD-01.

## PRD-04
**Conversion panels in `/platform/analytics`** — priority **P1**

- **Problem:** Data is useless without views.
- **Objective:** Aggregates by language, channel, page type, top landings, CTA and signup source (minimum cell size 5).
- **Verified current state:** NOT BUILT.
- **Files / modules:** `src/lib/platform/analytics.ts`, platform analytics page, contract §7.
- **Dependencies:** PRD-01 steps 2–4.
- **Technical scope:** Add queries and charts; aggregates only.
- **Acceptance criteria:** Numbers match seeded fixtures; no row-level visitor data.
- **Tests needed:** DB tests for aggregation.
- **Risks:** Small-cell re-identification.
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** —
- **Related PRs / issues:** #110
- **Recommended order:** After PRD-02/03.

## PRD-08
**Privacy-policy text for analytics (EN/FR) after legal review** — priority **P1**

- **Problem:** The policy must describe first-party analytics accurately (pseudonymous daily hash, retention, signup attribution).
- **Objective:** Publish counsel-approved text.
- **Verified current state:** DRAFT ONLY (contract §8); not published.
- **Files / modules:** `src/app/(site)/privacy/page.tsx`, contract §8.
- **Dependencies:** LANG-02.
- **Technical scope:** Replace the draft wording with counsel's; update EN and FR together.
- **Acceptance criteria:** The policy matches what the code stores.
- **Tests needed:** Copy tests.
- **Risks:** Describing the hash as anonymous.
- **Human intervention:** YES.
- **Legal approval:** YES.
- **External services:** Counsel.
- **Related PRs / issues:** #110
- **Recommended order:** With PRD-01.

## QA-02
**Verify Help article claims against the real product (start with approval history)** — priority **P1**

- **Problem:** The Help article 'Understand estimate approval history' says recorded decisions can be reviewed on the estimate; the sales playbook audit (PR #86) says no admin screen lists approval decisions. Other guides were written from code but not re-verified in the UI.
- **Objective:** Each of the 13 articles is checked against the live product; wrong or aspirational statements are fixed or removed.
- **Verified current state:** NOT DONE. Feature pages deliberately avoid the in-app-review claim.
- **Files / modules:** `src/lib/marketing-resources.ts` (GUIDES), `src/lib/help/articles.ts`, `src/app/(site)/admin/(shop)/quotes/[id]/page.tsx`.
- **Dependencies:** Someone with a seeded shop (e.g. the Garage Laurent seed).
- **Technical scope:** Walk each guide's steps in the app; list mismatches; fix copy (EN, then FR when it exists).
- **Acceptance criteria:** A per-article checklist with pass/fail and date; no step references a missing screen.
- **Tests needed:** Copy tests.
- **Risks:** Publishing instructions for non-existent features.
- **Human intervention:** YES (someone must click through).
- **Legal approval:** No.
- **External services:** —
- **Related PRs / issues:** #111
- **Recommended order:** Before CNT-01.

## QA-04
**Run DB-backed regression suites and a smoke test (login, signup, dashboard, booking, portal)** — priority **P1**

- **Problem:** Eight DB-gated tests are skipped in the agent environment; flows with a database were not exercised for the V1 PRs (they touch none of those code paths).
- **Objective:** Evidence that auth, dashboard, booking and portal are unaffected after the V1 merges.
- **Verified current state:** NOT RUN here. Earlier PRs (#100, #101) ran 32/32 and 47/47 browser checks on a local PostgreSQL.
- **Files / modules:** `tests/*-db.test.ts`, `scripts/run-integration.mjs`, `npm run test:integration`.
- **Dependencies:** A PostgreSQL (local or CI service).
- **Technical scope:** Run the DB suites and a manual smoke on a Preview with a seeded database (login, signup, create booking, open a portal link).
- **Acceptance criteria:** All DB suites green; smoke checklist recorded.
- **Tests needed:** —
- **Risks:** Date-dependent historic failures in `sales-comms-db` (documented in PR #98).
- **Human intervention:** Maybe.
- **Legal approval:** No.
- **External services:** PostgreSQL / Preview DB.
- **Related PRs / issues:** —
- **Recommended order:** #113–#116 are merged; proceed after the P0 items.

## SEC-04
**Retention policy for first-party analytics (13 months) with verifiable purge** — priority **P1**

- **Problem:** No retention limit exists for `PageView`; the owner approved at most 13 months for individual rows with a verifiable purge.
- **Objective:** Scheduled, bounded, monitored deletion with retry policy and proof that it ran.
- **Verified current state:** DESIGNED, NOT BUILT (`docs/analytics-v2-contract.md` §5, §10.7).
- **Files / modules:** `src/lib/platform/analytics.ts`, cron pattern (`.github/workflows/sales-cron.yml`, `src/lib/cron-auth.ts`), `db-backup-watchdog.yml` as watchdog model.
- **Dependencies:** Owner approval of a migration for the run-log table (or reuse the audit log); policy text.
- **Technical scope:** Cron deletes `PageView`/`AnalyticsEvent` rows older than 13 months in batches (≈5 000), 3 retries with backoff, append-only run log (`runAt`, counts, `oldestRemaining`, status), watchdog alert if no success in 3 days, Super Admin read-only check.
- **Acceptance criteria:** No row older than 13 months + 1 day remains; a failed run alerts and the next run retries; the check shows `oldestRemaining`.
- **Tests needed:** DB test: old rows purged, recent kept; failure/retry; watchdog logic.
- **Risks:** Long-running deletes: batch and time-box.
- **Human intervention:** YES (approve schema/log table).
- **Legal approval:** Retention figure to be confirmed by counsel.
- **External services:** GitHub Actions secrets.
- **Related PRs / issues:** #110
- **Recommended order:** After SEC-01…03; with PRD-01.


---

# P2 tasks

## CNT-03
**Blog: bilingual structure and priority topics** — priority **P2**

- **Problem:** The blog has 3 EN posts; the owner's priority topics are not covered.
- **Objective:** Real dates/author/`BlogPosting`, EN plus natively reviewed FR. Topics: online booking for shops, digital inspections, quotes/estimates/approvals, maintenance reminders, customers and work orders, Excel vs shop software, SMS/email communication, shop productivity.
- **Verified current state:** NOT STARTED beyond the 3 existing posts.
- **Files / modules:** `src/lib/marketing-resources.ts` (BLOG_POSTS), `src/app/(site)/blog/**`, `docs/seo-master-plan.md` §5.2.
- **Dependencies:** CNT-08 (keywords); LANG-01 for FR.
- **Technical scope:** Add content fields (author, real datePublished/Modified, reviewer), `BlogPosting` JSON-LD, posts in waves of 3–4; each cites sources; no invented volumes or capabilities.
- **Acceptance criteria:** Each post has real dates, sources, one natural CTA and internal links; FR pairs only when natively reviewed.
- **Tests needed:** Allow `BlogPosting` on posts in the SEO guard.
- **Risks:** Thin content; unverifiable claims.
- **Human intervention:** YES.
- **Legal approval:** Tax/regulatory posts need review.
- **External services:** —
- **Related PRs / issues:** —
- **Recommended order:** After PRD-01 data, or earlier with an owner topic list.

## CNT-05
**Solutions pages (problem-based)** — priority **P2**

- **Problem:** Planned 6 pages: spreadsheets/paper, no-shows, faster approvals, seasonal tire storage, GST/QST invoicing, multi-location.
- **Objective:** Pages that each link at least 2 real features.
- **Verified current state:** NOT STARTED.
- **Files / modules:** `docs/seo-master-plan.md` §5.1.
- **Dependencies:** Feature pages (#114).
- **Technical scope:** Create typed data like `feature-pages.ts`; EN first; FR drafts noindex.
- **Acceptance criteria:** Each solution links ≥ 2 real features; metadata unique.
- **Tests needed:** Pattern tests like `features-pages.test.ts`.
- **Risks:** Overlap with feature pages.
- **Human intervention:** YES.
- **Legal approval:** Tax wording review.
- **External services:** —
- **Related PRs / issues:** #114
- **Recommended order:** After CNT-03 wave 1.

## CNT-06
**Compare: GarageOS vs spreadsheets/paper/manual first; vendor comparisons only with current official sources** — priority **P2**

- **Problem:** Owner decision: start with spreadsheets/paper/manual; named vendors need up-to-date official evidence and review.
- **Objective:** A compare hub with methodology and verification date, and one 'vs spreadsheets/paper' page.
- **Verified current state:** NOT STARTED.
- **Files / modules:** `docs/seo-master-plan.md` §8.
- **Dependencies:** Evidence supplied by the owner or someone with web access.
- **Technical scope:** Write the spreadsheets page (no legal risk); vendor pages only with dated primary sources and counsel review.
- **Acceptance criteria:** Verification date visible; GarageOS limitations stated.
- **Tests needed:** Content test: no vendor claim without a source field.
- **Risks:** Defamation/stale facts.
- **Human intervention:** YES.
- **Legal approval:** YES for vendors.
- **External services:** Competitor sites.
- **Related PRs / issues:** —
- **Recommended order:** After CNT-03.

## CNT-07
**Changelog: first verifiable Git release and dated entries** — priority **P2**

- **Problem:** Owner decision: start from the first release whose date and changes can be verified in Git; no invented history.
- **Objective:** Real dated EN/FR changelog.
- **Verified current state:** The current `/changelog` is a thematic summary, not dated releases.
- **Files / modules:** `src/app/(site)/changelog/page.tsx`, git history (merge commits/tags).
- **Dependencies:** Owner picks the start point.
- **Technical scope:** Derive entries from merge commits/tags and verify deployed state.
- **Acceptance criteria:** Every entry has a verifiable commit/merge date.
- **Tests needed:** Content test: dates parse and are not in the future.
- **Risks:** Claiming undeployed changes.
- **Human intervention:** YES (choose start point).
- **Legal approval:** No.
- **External services:** —
- **Related PRs / issues:** —
- **Recommended order:** Any time.

## CNT-08
**Keyword and search-intent strategy** — priority **P2**

- **Problem:** No demand data; priorities were set by relevance only.
- **Objective:** A prioritised list from Search Console queries (after launch) and, optionally, a tool.
- **Verified current state:** NOT STARTED.
- **Files / modules:** `docs/seo-master-plan.md` §7.
- **Dependencies:** SEO-01 data.
- **Technical scope:** Review queries, cluster by intent, adjust titles/H1s/links.
- **Acceptance criteria:** Decisions logged with the query data used.
- **Tests needed:** —
- **Risks:** Inventing volumes is forbidden.
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** Search Console / optional keyword tool.
- **Related PRs / issues:** —
- **Recommended order:** After 4 weeks of data.

## CNT-09
**Internal-linking pass** — priority **P2**

- **Problem:** Links exist (features↔Help↔resources) but were not audited site-wide.
- **Objective:** Natural links from commercial pages to Help/features and back.
- **Verified current state:** PARTIAL.
- **Files / modules:** All marketing pages; `src/lib/marketing-flow.ts`.
- **Dependencies:** CNT-01.
- **Technical scope:** Audit orphan pages and anchor text; add contextual links.
- **Acceptance criteria:** No orphan indexable page; no broken links.
- **Tests needed:** Add a link-checker over built HTML.
- **Risks:** Over-linking.
- **Human intervention:** No.
- **Legal approval:** No.
- **External services:** —
- **Related PRs / issues:** —
- **Recommended order:** With CNT-01 waves.

## CNT-11
**`/resources` French equivalent** — priority **P2**

- **Problem:** The hub exists in EN only.
- **Objective:** `/fr/ressources` once there is enough French content (FR Help, FR blog).
- **Verified current state:** NOT STARTED.
- **Files / modules:** `src/app/(site)/resources/page.tsx`, route table (`resources` has `frStatus: none`).
- **Dependencies:** CNT-02, CNT-03.
- **Technical scope:** Add the FR page and route entry, then FR-01.
- **Acceptance criteria:** Hreflang pair only when both are indexable.
- **Tests needed:** Route tests.
- **Risks:** Thin French hub.
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** —
- **Related PRs / issues:** #115
- **Recommended order:** After CNT-02.

## INF-01
**Preview host: canonical/sitemap show a stale host on Vercel Previews** — priority **P2**

- **Problem:** The Preview-environment `NEXT_PUBLIC_APP_URL` is a fixed old branch URL, so Preview canonicals/sitemap/robots carry the wrong host. Cosmetic (Previews are `noindex`) but it blocks host verification before merge.
- **Objective:** Preview canonicals correct without changing production behaviour.
- **Verified current state:** OPEN. Production is correct.
- **Files / modules:** `src/config/app.ts` (`getAppUrl`), `src/lib/seo/site.ts` (`getSiteUrl`).
- **Dependencies:** Owner decision.
- **Technical scope:** Option A (no code): edit the Preview env var in Vercel. Option B (code): only when `VERCEL_ENV === 'preview'`, derive the host for metadata display; never use `VERCEL_URL` for production, emails, auth callbacks or app links; Preview stays `noindex`.
- **Acceptance criteria:** Production canonicals unchanged (a test pins `https://www.garage-os.ca`); Preview shows its own host; auth/emails/links unaffected.
- **Tests needed:** `tests/seo-canonical.test.ts` with env permutations.
- **Risks:** Leaking Preview URLs into emails/auth.
- **Human intervention:** YES (A) or approval (B).
- **Legal approval:** No.
- **External services:** Vercel env.
- **Related PRs / issues:** #99
- **Recommended order:** Whenever convenient.

## INF-03
**Review the French videos and voice-over** — priority **P2**

- **Problem:** FR videos use old terminology (`video/src/locales/fr.ts`); regeneration must not be automatic.
- **Objective:** Corrected terms and narration alignment, regenerated deliberately.
- **Verified current state:** NOT DONE.
- **Files / modules:** `video/src/locales/fr.ts`, `.github/workflows/video-render.yml`, `docs/sales-video.md`.
- **Dependencies:** LANG-01 terminology decisions.
- **Technical scope:** Fix strings, re-render approved videos, re-upload under the same R2 keys.
- **Acceptance criteria:** The approved FR video plays with correct terms.
- **Tests needed:** `npm run video:verify-cdn`.
- **Risks:** Overwriting approved assets.
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** Cloudflare R2.
- **Related PRs / issues:** #96
- **Recommended order:** After LANG-01.

## INF-06
**Video CDN: verify R2 publication and the website video block** — priority **P2**

- **Problem:** The home video block, `/watch/*` and the `/resources` video section hide themselves until videos are published (Platform → Sales → Settings → Videos); publication status is unverified.
- **Objective:** Confirm the four approved videos are published and play on Safari/iOS and Chrome.
- **Verified current state:** UNVERIFIED.
- **Files / modules:** `docs/sales-video.md`, `src/lib/sales-video.ts`, `src/components/video/*`.
- **Dependencies:** —
- **Technical scope:** Check settings, run `npm run video:verify-cdn -- <cdn>`, play on devices.
- **Acceptance criteria:** The home block and `/resources` show videos; no placeholder.
- **Tests needed:** The CDN script.
- **Risks:** CDN misconfiguration.
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** Cloudflare R2/DNS.
- **Related PRs / issues:** #96
- **Recommended order:** With INF-03.

## PRD-05
**Demo-request form connected to the CRM (D14)** — priority **P2**

- **Problem:** The demo CTA leads to the interactive demo/booking flow; there is no consented, CRM-connected request form.
- **Objective:** A form with CASL-compliant consent that creates a CRM prospect/task.
- **Verified current state:** NOT STARTED (studied only).
- **Files / modules:** `src/lib/sales-crm/*`, `docs/sales-crm-*`, `src/app/(site)/demo`.
- **Dependencies:** Counsel on CASL consent; CRM owner.
- **Technical scope:** Design fields, consent record, anti-abuse, CRM insert via existing services, attribution (PRD-02).
- **Acceptance criteria:** Consent stored; spam protection; CRM entry correct.
- **Tests needed:** DB + abuse tests.
- **Risks:** CASL / Law 25.
- **Human intervention:** YES.
- **Legal approval:** YES.
- **External services:** —
- **Related PRs / issues:** —
- **Recommended order:** After PRD-01.

## PRD-07
**Contextual help links inside the dashboard (`HelpLink`)** — priority **P2**

- **Problem:** Users inside the app cannot jump to the matching article.
- **Objective:** A small help icon linking to the Help article in the user's language (EN until FR exists).
- **Verified current state:** NOT STARTED.
- **Files / modules:** `src/app/(site)/admin/(shop)/**`, `src/lib/help/index.ts` (`articlePath`).
- **Dependencies:** CNT-01/02.
- **Technical scope:** Add a `HelpLink` component and a screen→article map; link only to existing articles.
- **Acceptance criteria:** No dead links (test over the map).
- **Tests needed:** Unit test over the map.
- **Risks:** Touching dashboard layouts: keep it additive.
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** —
- **Related PRs / issues:** #111
- **Recommended order:** After CNT-01 wave 1.

## SEO-02
**Bing Webmaster Tools** — priority **P2**

- **Problem:** Bing's index also feeds other search surfaces.
- **Objective:** Site verified and sitemap submitted.
- **Verified current state:** NOT DONE (owner).
- **Files / modules:** `docs/seo-manual-checklist.md`.
- **Dependencies:** DNS access.
- **Technical scope:** Add the site and submit the sitemap.
- **Acceptance criteria:** Sitemap accepted.
- **Tests needed:** Manual.
- **Risks:** —
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** Bing Webmaster, DNS.
- **Related PRs / issues:** —
- **Recommended order:** With SEO-01.

## SEO-06
**Monitor the 301 consolidation of `/guides/*`** — priority **P2**

- **Problem:** After #113 the old guide URLs redirect; search engines need time.
- **Objective:** No traffic loss; Help URLs indexed.
- **Verified current state:** #113 merged 2026-10-14; redirects live (destination of `/guides/set-up-your-shop` observed 200 in production). Monitoring has not started (needs SEO-01).
- **Files / modules:** `src/lib/help/legacy-redirects.ts`.
- **Dependencies:** SEO-01; #113.
- **Technical scope:** Weekly Search Console checks for 4 weeks; keep the redirects permanently.
- **Acceptance criteria:** Help articles indexed; guides show 'Page with redirect'.
- **Tests needed:** The redirect test exists.
- **Risks:** Do not delete the redirects.
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** Search Console.
- **Related PRs / issues:** #113
- **Recommended order:** After merge.


---

# P3 tasks

## CNT-04
**Glossary** — priority **P3**

- **Problem:** Planned `/glossary` linking terms to Help/features.
- **Objective:** A small glossary of real GarageOS terms (Devis/Quote, Work Order…).
- **Verified current state:** NOT STARTED.
- **Files / modules:** `docs/seo-master-plan.md` §14.
- **Dependencies:** CNT-01.
- **Technical scope:** Typed entries, EN then FR.
- **Acceptance criteria:** Terms match UI strings.
- **Tests needed:** Terminology tests.
- **Risks:** Duplicate content.
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** —
- **Related PRs / issues:** —
- **Recommended order:** Late.

## CNT-10
**Regional content (province/city) only if justified by data** — priority **P3**

- **Problem:** The owner wants national orientation; regional pages risk thin content.
- **Objective:** Create regional content (e.g. Québec winter-tire rule) only with real value and sources.
- **Verified current state:** NOT STARTED.
- **Files / modules:** —
- **Dependencies:** CNT-08 data.
- **Technical scope:** Evaluate per topic; cite SAAQ/CRA/Revenu Québec.
- **Acceptance criteria:** Sources cited; no city/keyword variants.
- **Tests needed:** —
- **Risks:** Doorway pages.
- **Human intervention:** YES.
- **Legal approval:** Tax/regulatory review.
- **External services:** —
- **Related PRs / issues:** —
- **Recommended order:** Late.

## INF-04
**Fix legacy seed data of an applied migration without editing it** — priority **P3**

- **Problem:** Applied migration `20261009100000_sales_crm_foundation` seeds a row 'Soumissions et factures' (old FR term).
- **Objective:** Correct the row with a new, safe, idempotent procedure.
- **Verified current state:** NOT DONE (applied migrations must not be edited).
- **Files / modules:** `prisma/migrations/20261009100000_sales_crm_foundation/`.
- **Dependencies:** Owner approval.
- **Technical scope:** New migration or admin script updating the row.
- **Acceptance criteria:** Row text corrected; no other data changed.
- **Tests needed:** DB test.
- **Risks:** Migration risk.
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** Neon.
- **Related PRs / issues:** #102
- **Recommended order:** Low priority.

## PERF-03
**Help search index size at scale** — priority **P3**

- **Problem:** The search index is embedded in the `/help` payload (fine for ≈13 articles).
- **Objective:** Switch to a static JSON index fetched on demand if Help grows past ≈100 articles.
- **Verified current state:** NOT NEEDED YET.
- **Files / modules:** `src/components/help/HelpSearch.tsx`, `src/lib/help/search.ts`.
- **Dependencies:** CNT-01 growth.
- **Technical scope:** Generate `/help/search-index.json` at build; lazy-load on first keystroke.
- **Acceptance criteria:** Payload below threshold; same results.
- **Tests needed:** `help-center.test.ts` search tests.
- **Risks:** Complexity.
- **Human intervention:** No.
- **Legal approval:** No.
- **External services:** —
- **Related PRs / issues:** #113
- **Recommended order:** When needed.

## QA-01
**Admin login/signup: two `<h1>` and no `<main>` (issue #117)** — priority **P3**

- **Problem:** Pre-existing structural a11y issue found in the V1 audit (noindex pages).
- **Objective:** One `<h1>` and a `<main>` landmark; no visual change.
- **Verified current state:** OPEN.
- **Files / modules:** `src/app/(site)/admin/login`, `.../signup`.
- **Dependencies:** —
- **Technical scope:** Demote the secondary heading; wrap the form in `<main>`.
- **Acceptance criteria:** DOM check at 390/820/1440: h1=1, main=1.
- **Tests needed:** Add the audit script check to the guard.
- **Risks:** Visual regressions.
- **Human intervention:** No.
- **Legal approval:** No.
- **External services:** —
- **Related PRs / issues:** #117
- **Recommended order:** Any time.

## SEO-03
**Video SEO: video sitemap and `VideoObject`** — priority **P3**

- **Problem:** `/watch/*` is intentionally outside the sitemap; no video structured data on indexable pages.
- **Objective:** Add a video sitemap / `VideoObject` when indexable pages embed videos with real upload dates.
- **Verified current state:** NOT STARTED (owner: study later).
- **Files / modules:** `/watch/*`, `src/components/video/*`.
- **Dependencies:** INF-06.
- **Technical scope:** Design after videos are confirmed.
- **Acceptance criteria:** Valid in the Rich Results test.
- **Tests needed:** JSON-LD tests.
- **Risks:** Attributed `/watch` URLs are `noindex`.
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** Search Console.
- **Related PRs / issues:** #96
- **Recommended order:** Late.

## SEO-04
**Post-launch optimisation (titles, CTR, internal links, refreshes)** — priority **P3**

- **Problem:** Needs real data.
- **Objective:** Data-driven edits.
- **Verified current state:** NOT STARTED.
- **Files / modules:** Pages plus the `seo-rendered` guard.
- **Dependencies:** At least 4 weeks of Search Console data.
- **Technical scope:** Iterate on queries/pages with low CTR.
- **Acceptance criteria:** Each change cites the query data.
- **Tests needed:** The guard keeps lengths and uniqueness.
- **Risks:** Churn.
- **Human intervention:** YES.
- **Legal approval:** No.
- **External services:** —
- **Related PRs / issues:** —
- **Recommended order:** Late.

## SEO-05
**Structured-data expansion (SoftwareApplication, Offer, FAQ) only when verifiable** — priority **P3**

- **Problem:** V1 JSON-LD is limited by design (Organization, WebSite, BreadcrumbList).
- **Objective:** Add types only with verifiable data (e.g. `Offer` derived from `PLAN_PRICING_CAD`).
- **Verified current state:** NOT STARTED.
- **Files / modules:** `src/lib/seo/json-ld.ts`, `tests/seo-rendered.test.ts`.
- **Dependencies:** Pricing review; legal.
- **Technical scope:** One type per PR with tests.
- **Acceptance criteria:** Passes the Rich Results test; no ratings/reviews/fake data.
- **Tests needed:** Allowed-type list in the guard.
- **Risks:** Spammy markup.
- **Human intervention:** No.
- **Legal approval:** Maybe.
- **External services:** —
- **Related PRs / issues:** #108
- **Recommended order:** Late.

---

# Do NOT re-implement (already done and verified)
Canonical per page · `robots.txt` + `Sitemap:` · sitemap generation from the route table · private/token `noindex` + `Referrer-Policy` · EN/FR routing with separate root layouts and `lang` · French terminology guard · SEO CI guard (`tests/seo-*.test.ts`) · Pricing single `<h1>` · Help Center platform (typed content, categories, breadcrumbs, TOC, related, search, 301s from `/guides/*` — #111/#113) · four feature pages (#114) · `/resources` hub (#115) · analytics UTM/DNT/GPC hardening (#116) — all merged and in production since 2026-10-14. If a task overlaps one of these, extend it — do not rebuild it.

# Prompt to resume this backlog
See the last section of [`SEO_HANDOFF.md`](./SEO_HANDOFF.md).
