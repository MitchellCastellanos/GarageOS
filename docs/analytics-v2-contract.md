# Analytics v2 — event contract, minimisation, retention, anti-abuse, privacy text (DESIGN ONLY)

Status: **proposal for owner approval. No code, no migration and no new storage is deployed by this document.** Scope approved by the owner (2026-10-13): channel classification, CTA events, signup/demo attribution, analytics panel; no tracking cookies, no tokens, no unnecessary personal data. Implementation (PR "Analytics v2") starts only after this design is approved.

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
| IP, full user-agent, any cookie/localStorage id, email, name, phone, token-shaped values (24+ url-safe chars), full URL, query string, fragment, referrer path, private/token routes, free-text from the client | normalised public path, locale, channel, pageType, referrer **host**, sanitised utm_*, coarse device/browser, country code, daily-salted `visitorHash`, `ctaId` from the allowlist |

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
**EN:** "We measure visits to our website with our own first-party analytics. We do not use cookies or third-party trackers for this. For each visit we record the public page visited, the language, the type of source (for example search, direct or a link from another site), the referring website's name, campaign parameters in the link, your approximate country, the type of device and browser, and a daily-rotating anonymous code that cannot be used to follow you from one day to the next. We do not store your IP address. When you create an account, we record the page and source that led to it, together with your business account, to understand which content helps. We keep visit data for 13 months."

**FR (à faire valider par un réviseur et par un conseiller juridique):** « Nous mesurons les visites de notre site avec notre propre outil d'analyse, sans témoins (cookies) ni traqueurs de tiers. Pour chaque visite, nous consignons la page publique consultée, la langue, le type de provenance (par exemple recherche, accès direct ou lien d'un autre site), le nom du site de provenance, les paramètres de campagne du lien, votre pays approximatif, le type d'appareil et de navigateur, ainsi qu'un code anonyme qui change chaque jour et ne permet pas de vous suivre d'un jour à l'autre. Nous ne conservons pas votre adresse IP. Lorsque vous créez un compte, nous consignons la page et la provenance qui y ont mené, avec votre compte d'entreprise, afin de savoir quels contenus sont utiles. Nous conservons les données de visite pendant 13 mois. »
Needs: legal confirmation (Law 25 / PIPEDA wording, retention), native review. The current privacy page must be updated only after this approval.

## 9. Decisions for the owner
1. Approve schema §4 (two additive tables, two additive columns) and retention §5 (13 months proposed).
2. Approve honouring DNT/GPC (§6).
3. Approve the CTA id list (§2) and the signup attribution record (business-account scoped).
4. Legal review of §8 before publishing.
