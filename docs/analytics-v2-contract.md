# Analytics v2 — event contract, minimisation, retention, anti-abuse, privacy text (DESIGN ONLY)

Status: **design approved in concept by the owner on 2026-10-13; this document (and PR #110) is documentation only and does NOT authorise any migration, table or new analytics storage.** The implementation PR ("Analytics v2") is a separate step that starts after the adjustments in §10 are accepted. Approved in concept: columns `channel` and `pageType`; table `AnalyticsEvent`; table `SignupAttribution` linked to `Shop`; the eight CTA ids; signup attribution; aggregate panels by language, channel, page and CTA; honouring DNT/GPC; no tracking cookies or third-party trackers; retention of at most 13 months for individual `PageView`/`AnalyticsEvent` rows with verifiable automatic purge; `SignupAttribution` kept with the shop account and deleted with it.

## 1. What exists today (verified in code)
- `AnalyticsBeacon` → `POST /api/track` → `trackPageView` → `PageView` row: normalised path (private/token paths never stored), `locale` (from the route), `referrerHost` (host only, own host dropped), sanitised `utmSource/Medium/Campaign`, `device`, `browser`, `country` (Vercel header), `shopSlug`, `visitorHash` = sha256(daily salt | IP | UA) truncated to 32 hex (rotates daily; IP is never stored). Bot user-agents are skipped. No cookies, no client storage.
- Gaps: no channel, no page type, no CTA events, no signup/demo attribution, no rate limit on `/api/track`, no body-size cap, no dimensions for language/channel/landing in `/platform/analytics` (it has top referrers).

## 2. Event contract
All events go through the same endpoint family, always answer `204`, never block navigation, and carry **no identifier beyond the daily `visitorHash`**.

| Event | Fired when | Fields (allowlist) |
|---|---|---|
| `pageview` (existing) | route change on a trackable public path | `path`, `locale`, `referrerHost`, `utm*`, `device`, `browser`, `country`, `shopSlug`, `visitorHash`; **new, derived server-side:** `channel`, `pageType` |
| `cta_click` | click on a marked CTA | `ctaId` ∈ {`demo_book`, `demo_interactive`, `signup_start`, `plan_select_core`, `plan_select_pro`, `plan_select_complete`, `pricing_view`, `watch_play`}, `path` (page where it was clicked), `locale`, `visitorHash` |
| `signup_attribution` | server side, when an account (shop) is created | see §4 — written by the server from validated hand-off parameters, never from a client-trusted free text |
| `demo_request_attribution` | only if/when the demo-request form (D14, separate future PR) exists | same fields as signup |

Derived fields (server only, from data already received):
- `channel` ∈ {`direct`, `organic_search`, `social`, `email`, `referral`, `campaign`}: `campaign` if any `utm_*` present (then `utm_medium` refines: `email`, `cpc` stays `campaign`); else by `referrerHost` against short allowlists (search: google, bing, duckduckgo, yahoo, ecosia, qwant; social: facebook, instagram, linkedin, x/twitter, youtube, reddit, tiktok); else `referral` if any other host; else `direct`. Internal navigation is never a channel.
- `pageType` ∈ {`home`, `commercial`, `help`, `blog`, `legal`, `watch`, `other`} from the route table / path prefix.

Hand-off parameters on CTA links to the signup/demo flow (no storage on the client): `?from=<pageType>:<slug>` and `&lang=<en|fr>` (UTM already in the URL are forwarded). `from` must match `^[a-z]+:[a-z0-9-]{1,40}$`; anything else is dropped. The language-switch carry-over already forwards only sanitised `utm_*` (`src/lib/seo/switch-params.ts`).

## 3. Minimisation schema (what may and may not be stored)
| Never stored | Stored |
|---|---|
| IP, full user-agent, any cookie/localStorage id, email, name, phone, token-shaped values (24+ url-safe chars), full URL, query string, fragment, referrer path, private/token routes, free-text from the client | normalised public path, locale, channel, pageType, referrer **host**, sanitised utm_*, coarse device/browser, country code, daily-salted `visitorHash` (pseudonymous, not anonymous — see §10.1), `ctaId` from the allowlist |

Rules: strict enum/regex validation on the server; unknown fields ignored; values truncated; token-shaped values replaced by empty string (existing `sanitizeCampaignValue`); the `path` must pass `isTrackablePath`. Multi-day journeys are **not** reconstructed (the hash rotates daily) — conscious limitation.

## 4. Proposed storage (additive, NOT created yet)
1. `PageView`: add `channel TEXT NOT NULL DEFAULT ''`, `pageType TEXT NOT NULL DEFAULT ''` (additive, no backfill).
2. New table `AnalyticsEvent` (`id`, `createdAt`, `type` enum {`CTA_CLICK`}, `ctaId`, `path`, `locale`, `channel`, `pageType`, `visitorHash`), indexes on `(createdAt)` and `(type, ctaId, createdAt)`.
3. New table `SignupAttribution` (`id`, `createdAt`, `shopId` FK `ON DELETE CASCADE`, `landingPath`, `locale`, `channel`, `pageType`, `ctaId`, `utmSource/Medium/Campaign`, `referrerHost`) — **no email, no IP, no visitorHash**. Linked to the business account only; deleted with it.
Migration would be new and additive (the applied migrations are never edited); needs your approval of this schema first.

## 5. Retention (proposal — owner/legal to confirm)
- `PageView` and `AnalyticsEvent`: raw rows 13 months, then delete or aggregate to daily counts per (path, locale, channel, cta). A scheduled job (existing cron pattern) to be proposed in the implementation PR.
- `SignupAttribution`: life of the account (cascade delete); no separate copy elsewhere.
- Exports/backups follow the existing backup retention; rows already minimised so backups hold no personal data from this feature.

## 6. Anti-abuse
- Per-IP rate limit on `/api/track` and the event endpoint using the existing `src/lib/rate-limit.ts` (`RATE_LIMITS` new entries; proposal: 120 pageviews/min and 30 events/min per IP), silent `204` when exceeded.
- Body cap 2 KB before parsing; strict schema; `ctaId` allowlist; max one identical `(visitorHash, type, ctaId, path)` per minute (dedupe).
- Bot UA filter kept; honour `Sec-GPC: 1` / `DNT: 1` by not recording events (consistent with the sales-video tracker).
- Same-origin check (`Origin` header host = site host) to reduce cross-site spam; never trusted for security.
- Panel numbers are advisory; no billing or permission depends on them.

## 7. Panel (`/platform/analytics`) additions
Views by language, channel, pageType; top landing pages; CTA clicks by `ctaId` and by page; signup sources (counts per channel/landing/lang); filters by date range. Aggregates only; no row-level view of visitors.

## 8. Privacy policy text (draft for legal review — not published)
**EN:** "We measure visits to our website with our own first-party analytics. We do not use cookies or third-party trackers for this. For each visit we record the public page visited, the language, the type of source (for example search, direct or a link from another site), the referring website's name, campaign parameters in the link, your approximate country, the type of device and browser, and a code that changes every day and is derived from technical data of your connection, which we use to count distinct visits and which we do not use to follow you from one day to the next. We do not store your IP address. When you create an account, we record the page and source that led to it, together with your business account, to understand which content helps. We keep visit data for 13 months."

**FR (à faire valider par un réviseur et par un conseiller juridique):** « Nous mesurons les visites de notre site avec notre propre outil d'analyse, sans témoins (cookies) ni traqueurs de tiers. Pour chaque visite, nous consignons la page publique consultée, la langue, le type de provenance (par exemple recherche, accès direct ou lien d'un autre site), le nom du site de provenance, les paramètres de campagne du lien, votre pays approximatif, le type d'appareil et de navigateur, ainsi qu'un code qui change chaque jour et qui est calculé à partir de données techniques de votre connexion; nous l'utilisons pour compter les visites distinctes et non pour vous suivre d'un jour à l'autre. Nous ne conservons pas votre adresse IP. Lorsque vous créez un compte, nous consignons la page et la provenance qui y ont mené, avec votre compte d'entreprise, afin de savoir quels contenus sont utiles. Nous conservons les données de visite pendant 13 mois. »
Needs: legal confirmation (Law 25 / PIPEDA wording, retention), native review. The current privacy page must be updated only after this approval.

## 9. Decisions for the owner
1. Approve schema §4 (two additive tables, two additive columns) and retention §5 (13 months proposed).
2. Approve honouring DNT/GPC (§6).
3. Approve the CTA id list (§2) and the signup attribution record (business-account scoped).
4. Legal review of §8 before publishing.

## 10. Adjustments requested by the owner (2026-10-13) — binding for the implementation PR

### 10.1 The daily hash is pseudonymous, not anonymous
`visitorHash = sha256(dailySalt | IP | UA)` is derived from personal-data-adjacent inputs. It must never be described as "anonymous" in code comments, UI or policy text. Accurate description: a *pseudonymous identifier that rotates daily*; it cannot be linked across days **only while the daily salt is secret and discarded** — the implementation PR must (a) keep the salt server-side only, (b) never log it, (c) delete salts of past days (today the salt derivation is in `analytics.ts` `dailySalt()`; the PR must verify it is not derivable from a long-lived secret + date alone, or document that it is, and treat the hash as personal information accordingly). Drafted policy text in §8 was reworded accordingly. The policy treats these records as personal information with a purpose, a retention period and access limits.

### 10.2 Québec / Canada privacy implications (to verify with counsel — I am not giving legal advice)
Points the legal review must settle before any text is published: Québec Law 25 (Act respecting the protection of personal information in the private sector) — purpose limitation, retention, whether visit records with a pseudonymous identifier are personal information, privacy-by-default for technology offering functions that collect personal information (identification/tracking functions off by default), transparency and the requirement to name a person responsible for privacy; PIPEDA and CASL (CASL applies to commercial electronic messages, not to first-party page analytics, but the signup record must not be used for messaging); cross-border considerations (Vercel/Neon hosting regions) for disclosures; consent model for analytics without cookies. Until counsel answers: collect the minimum in §3, no IP, no cross-day tracking, honour DNT/GPC, 13-month cap, and do not publish the definitive policy text.

### 10.3 Role-limited access to `SignupAttribution`
Readable only by Super Admin (platform) and, for aggregate counts, platform roles that already see `/platform/analytics`. Never exposed to shop users, never joined into shop-facing screens or exports, never in portal/booking. Reads go through a single server function with an explicit role check (same pattern as the other `/platform` services) and a test that a shop Owner/Mechanic/Viewer cannot read it. No export of row-level data; the panel shows aggregates only (minimum cell size 5 to avoid re-identification in small groups).

### 10.4 UTM values cannot carry tokens or personal data
Server-side allowlist, not just truncation: each of `utm_source|medium|campaign` must match `^[a-z0-9][a-z0-9_.\-+ ]{0,39}$` after lower-casing; values containing `@`, more than 20 consecutive url-safe characters, 24+ hex/base64url strings, digits-only runs of 7+ (phone-like) or `%` sequences are replaced by empty string (extends the existing `sanitizeCampaignValue`). Applied to pageview, events and signup attribution, and to the language-switch carry-over. Unit tests with token-, e-mail- and phone-shaped values.

### 10.5 Idempotent signup attribution
`SignupAttribution` has `shopId` UNIQUE: one record per shop, created in the same transaction as the shop (or by `INSERT ... ON CONFLICT (shopId) DO NOTHING`), never updated afterwards (first-touch wins). Retries, double submits and email-verification replays therefore cannot duplicate or overwrite. A failure to write attribution never fails the signup (caught, logged without payload, signup continues). Test: create twice → one row; attribution failure → shop still created.

### 10.6 Tracking can never affect conversions or navigation
Client: `sendBeacon`/`fetch(keepalive)` fire-and-forget inside try/catch, no `await` in click handlers, CTA events never `preventDefault()` or delay navigation, no retries on the client. Server: always `204`, timeout on DB writes, errors swallowed and logged without payload; hand-off parameters (`from`, `lang`) are read optionally by signup and ignored when invalid. If the endpoint or DB is down, signup and demo flows behave exactly as today. Test: endpoint returning 500/timeout does not change CTA hrefs or signup success.

### 10.7 Verifiable purge after 13 months
- A scheduled job (existing cron pattern, authenticated like the other cron routes) deletes `PageView` and `AnalyticsEvent` rows with `createdAt < now() - interval '13 months'` in bounded batches (e.g. 5 000 rows per statement, loop until none or time budget reached).
- Errors: each run records `{ runAt, deletedPageView, deletedEvent, oldestRemaining, status, error? }` in an append-only log table (or the existing audit log) — no payload data. Failed run ⇒ non-zero exit/alert through the existing cron failure path; retry on the next scheduled run and an additional retry with exponential backoff inside the run (3 attempts).
- Verification: a read-only check function/endpoint for Super Admin returns `oldestRemaining` per table; invariant `oldestRemaining >= now - 13 months - 1 day`; a test inserts old rows and asserts they are purged and recent ones kept; a watchdog (like `db-backup-watchdog`) alerts if the last successful purge is older than 3 days.
- Historical aggregates (daily counts by path/locale/channel/CTA) are kept only with a minimum cell size of 5 and without `visitorHash`, device+browser+country combinations or any field that allows rebuilding an individual's journey.
- `SignupAttribution` follows the account: `ON DELETE CASCADE` from `Shop`; the account deletion procedure test must assert it.

### 10.8 DNT and GPC apply to the existing analytics too
Today `/api/track` ignores them. The implementation PR makes `trackPageView` and the event endpoint return `204` without storing anything when `DNT: 1` or `Sec-GPC: 1` is present (server-side header check, so it holds even if the client script changes), including for the existing `pageview` event. A test covers both headers on both endpoints. The behaviour change (fewer recorded visits) is noted in the panel as a footnote, since counts will drop for those visitors.

### 10.9 Not authorised by this document
No migration, no new table or column, no deployment of storage, no publication of privacy text. The implementation PR must be opened, reviewed and explicitly authorised by the owner.
